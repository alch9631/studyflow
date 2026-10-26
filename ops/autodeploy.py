#!/usr/bin/env python3
"""Deploy CI-green GitHub main snapshots to the existing StudyFlow user service."""
import argparse
import datetime
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import signal
import sqlite3
import subprocess
import tarfile
import tempfile
import time
import urllib.parse
import urllib.request


def timestamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def read_json(path):
    return json.loads(path.read_text()) if path.is_file() else {}


def write_json(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.replace(path)


def ci_result(runs, commit, branch):
    matching = [r for r in runs if r.get('head_sha') == commit
                and r.get('head_branch') == branch and r.get('event') == 'push']
    if not matching:
        return 'pending'
    latest = max(matching, key=lambda r: (r.get('id', 0), r.get('run_attempt', 1)))
    if latest.get('status') != 'completed':
        return 'pending'
    return 'success' if latest.get('conclusion') == 'success' else 'failed'


class Deployer:
    def __init__(self, config):
        self.config = config
        self.app = Path(config['app_dir']).resolve()
        self.state_dir = Path(config['state_dir']).resolve()
        self.build_root = Path(config['build_root']).resolve()
        self.state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.build_root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.state_file = self.state_dir / 'status.json'
        self.state = read_json(self.state_file)
        self.env = dict(os.environ, GIT_TERMINAL_PROMPT='0', GH_PROMPT_DISABLED='1')
        self.env['PATH'] = ':'.join([str(Path(config['node']).parent),
                                     str(Path(config['gh']).parent), '/usr/local/bin', '/usr/bin', '/bin'])

    def run(self, args, cwd=None, env=None, capture=False, timeout=1200):
        result = subprocess.run(args, cwd=cwd or self.app, env=env or self.env,
                                stdout=subprocess.PIPE if capture else None,
                                stderr=subprocess.PIPE if capture else None, timeout=timeout)
        if result.returncode:
            detail = (result.stderr or b'').decode(errors='replace')[-2000:] if capture else ''
            raise RuntimeError(f'{Path(args[0]).name} failed ({result.returncode}) {detail}')
        return result.stdout if capture else b''

    def status(self, status, **fields):
        self.state.update(status=status, checkedAt=timestamp(), **fields)
        write_json(self.state_file, self.state)
        print(json.dumps({'status': status, **fields}), flush=True)

    def latest(self):
        self.run(['git', 'fetch', '--quiet', 'origin', self.config['branch']], timeout=90)
        return self.run(['git', 'rev-parse', f"origin/{self.config['branch']}"], capture=True, timeout=30).decode().strip()

    def ci(self, commit):
        query = urllib.parse.urlencode({'branch': self.config['branch'], 'event': 'push',
                                       'head_sha': commit, 'per_page': 10})
        path = f"repos/{self.config['github_repository']}/actions/workflows/{self.config['workflow']}/runs?{query}"
        data = json.loads(self.run([self.config['gh'], 'api', path], capture=True, timeout=60))
        return ci_result(data.get('workflow_runs', []), commit, self.config['branch'])

    def prepare(self, commit):
        stage = Path(tempfile.mkdtemp(prefix=f'release-{commit[:12]}-', dir=self.build_root))
        self.status('building', latestCommit=commit, releaseDir=str(stage))
        archive = self.run(['git', 'archive', '--format=tar', commit], capture=True, timeout=60)
        with tarfile.open(fileobj=io.BytesIO(archive)) as source:
            source.extractall(stage, filter='data')
        write_json(stage / 'release-source.json', {'commit': commit, 'preparedAt': timestamp()})
        # Install and build without the production database or runtime secrets.
        build_env = dict(self.env, DATABASE_URL=f'file:{stage}/prisma/test-build.db',
                         NODE_OPTIONS='--max-old-space-size=1536', CI='true')
        build_env.pop('NODE_ENV', None)
        self.run([self.config['npm'], 'ci', '--include=dev', '--no-audit', '--no-fund'], cwd=stage, env=build_env)
        # npm can skip dependency lifecycle scripts; never rely on Prisma's postinstall.
        self.run([self.config['node'], str(stage / 'node_modules/prisma/build/index.js'),
                  'generate'], cwd=stage, env=build_env)
        self.run([self.config['npm'], 'run', 'build'], cwd=stage, env=build_env)
        candidate = stage / '.next'
        build_id = (candidate / 'BUILD_ID').read_text().strip()
        if not (candidate / 'standalone/server.js').is_file() or (candidate / 'standalone/.next/BUILD_ID').read_text().strip() != build_id:
            raise RuntimeError('Standalone output is incomplete')
        return stage

    def service(self, verb):
        self.run(['systemctl', '--user', verb, self.config['service']], timeout=60)

    def healthy(self):
        deadline = time.monotonic() + self.config.get('health_timeout_seconds', 30)
        while time.monotonic() < deadline:
            try:
                with urllib.request.urlopen(self.config['health_url'], timeout=2) as response:
                    if response.status == 200 and json.load(response).get('ok') is True:
                        return True
            except Exception:
                pass
            time.sleep(0.25)
        return False

    def schema_hash(self, commit):
        if not commit:
            return None
        try:
            return hashlib.sha256(self.run(['git', 'show', f'{commit}:prisma/schema.prisma'], capture=True, timeout=30)).hexdigest()
        except RuntimeError:
            return None

    @staticmethod
    def copy_database(source, target):
        with sqlite3.connect(source) as src, sqlite3.connect(target) as dest:
            src.backup(dest)

    def activate(self, stage, commit):
        candidate, live = stage / '.next', self.app / '.next'
        previous = stage / 'previous-live-next'
        old_record = read_json(live / 'release.json')
        schema_hash = hashlib.sha256((stage / 'prisma/schema.prisma').read_bytes()).hexdigest()
        schema_changed = schema_hash != (old_record.get('schemaHash') or self.schema_hash(old_record.get('commit')))
        database = Path(self.config['database_file']).resolve()
        if schema_changed and not database.is_file():
            raise RuntimeError('Configured production database does not exist')
        backup = None
        old_moved = new_moved = False
        for name in ('.env', '.env.local', '.env.production', '.env.production.local'):
            if (self.app / name).is_file():
                shutil.copy2(self.app / name, candidate / 'standalone' / name)
        record = {'commit': commit, 'schemaHash': schema_hash,
                  'buildId': (candidate / 'BUILD_ID').read_text().strip(), 'deployedAt': timestamp()}
        for path in (candidate / 'release.json', candidate / 'standalone/.next/release.json'):
            write_json(path, record)
        self.status('activating', latestCommit=commit)
        try:
            self.service('stop')
            if schema_changed:
                backup_dir = self.state_dir / 'database-backups'
                backup_dir.mkdir(exist_ok=True, mode=0o700)
                if database.exists():
                    backup = backup_dir / f'{commit[:12]}-{time.time_ns()}.sqlite3'
                    self.copy_database(database, backup)
                migration_env = dict(self.env, DATABASE_URL=f'file:{database}')
                # No --accept-data-loss: incompatible changes abort and restore the old release.
                self.run([self.config['node'], str(stage / 'node_modules/prisma/build/index.js'),
                          'db', 'push', '--skip-generate'], cwd=stage, env=migration_env)
            live.rename(previous)
            old_moved = True
            candidate.rename(live)
            new_moved = True
            self.service('start')
            if not self.healthy():
                raise RuntimeError('New release failed the database health check')
        except BaseException:
            self.service('stop')
            if new_moved:
                live.rename(stage / 'failed-next')
            if old_moved:
                previous.rename(live)
            if backup:
                self.copy_database(backup, database)
            self.service('start')
            raise
        self.status('deployed', deployedCommit=commit, latestCommit=commit,
                    deployedAt=record['deployedAt'], failedCommit=None, retryAfter=0, error=None)
        self.cleanup(stage)

    def cleanup(self, current):
        # Only directories created by this deployer; retain the latest rollback bundles.
        stages = sorted((p for p in self.build_root.glob('release-*') if p.is_dir() and not p.is_symlink()),
                        key=lambda p: p.stat().st_mtime, reverse=True)
        for old in stages[self.config.get('keep_releases', 2):]:
            if old != current and (old / 'release-source.json').is_file():
                shutil.rmtree(old)
        backups = sorted((self.state_dir / 'database-backups').glob('*.sqlite3'),
                         key=lambda p: p.stat().st_mtime, reverse=True)
        for old in backups[5:]:
            old.unlink()

    def tick(self, retry=False):
        with (self.state_dir / 'deploy.lock').open('a') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                print('Another deployment is running.', flush=True)
                return
            commit = None
            try:
                commit = self.latest()
                deployed = read_json(self.app / '.next/release.json').get('commit')
                if commit == deployed:
                    self.status('up-to-date', deployedCommit=deployed, latestCommit=commit,
                                failedCommit=None, retryAfter=0, error=None)
                    return
                ci = self.ci(commit)
                if ci != 'success':
                    self.status('waiting-for-ci' if ci == 'pending' else 'ci-failed', latestCommit=commit)
                    return
                if not retry and self.state.get('failedCommit') == commit and self.state.get('retryAfter', 0) > time.time():
                    self.status('retry-scheduled', latestCommit=commit)
                    return
                stage = self.prepare(commit)
                if self.latest() != commit:
                    self.status('superseded', latestCommit=commit)
                    self.cleanup(stage)
                    return
                if self.ci(commit) != 'success':
                    self.status('waiting-for-ci', latestCommit=commit)
                    self.cleanup(stage)
                    return
                self.activate(stage, commit)
            except Exception as error:
                self.status('failed', failedCommit=commit, error=str(error),
                            retryAfter=time.time() + self.config.get('failure_cooldown_seconds', 600))
                self.cleanup(Path(self.state.get('releaseDir', self.build_root)))
                raise


def main():
    def interrupted(_signum, _frame):
        raise InterruptedError('Deployment interrupted')
    signal.signal(signal.SIGTERM, interrupted)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--retry', action='store_true', help='Retry a failed build without waiting for its cooldown.')
    parser.add_argument('--status', action='store_true', help='Print the last recorded status without deploying.')
    args = parser.parse_args()
    config = read_json(args.config.expanduser())
    if args.status:
        print(json.dumps(read_json(Path(config['state_dir']) / 'status.json'), indent=2))
        return
    Deployer(config).tick(retry=args.retry)


if __name__ == '__main__':
    main()
