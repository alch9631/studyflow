#!/usr/bin/env python3
"""Install/update the StudyFlow user timer, preserving existing local settings."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import urllib.parse


def main():
    os.umask(0o077)
    source = Path(__file__).resolve().parent
    app = source.parent
    home = Path.home()
    state = home / '.local/share/studyflow-deploy'
    settings = home / '.config/studyflow-deploy'
    units = home / '.config/systemd/user'
    for path in (state, settings, units):
        path.mkdir(parents=True, exist_ok=True)
    remote = subprocess.check_output(['git', 'remote', 'get-url', 'origin'], cwd=app, text=True).strip()
    url = urllib.parse.urlparse(remote)
    if url.hostname != 'github.com' or url.username or url.password:
        raise RuntimeError('Expected a GitHub HTTPS origin without embedded credentials')
    config_path = settings / 'config.json'
    existing = json.loads(config_path.read_text()) if config_path.is_file() else {}
    defaults = {
        'app_dir': str(app), 'state_dir': str(state),
        'build_root': str(home / '.cache/studyflow-deploy'),
        'github_repository': url.path.strip('/').removesuffix('.git'),
        'branch': 'main', 'workflow': 'ci.yml', 'service': 'studyflow.service',
        'database_file': str(app / 'prisma/dev.db'),
        'health_url': 'http://127.0.0.1:3000/api/health',
        'node': '/usr/local/bin/node', 'npm': '/usr/local/bin/npm',
        'gh': shutil.which('gh'), 'keep_releases': 2,
        'health_timeout_seconds': 30, 'failure_cooldown_seconds': 600,
    }
    config = {**defaults, **existing}
    for key in ('node', 'npm', 'gh'):
        if not config[key] or not Path(config[key]).is_file():
            raise RuntimeError(f'Missing executable: {key}')
    if int(subprocess.check_output([config['node'], '-p', 'process.versions.node.split(".")[0]'], text=True)) < 24:
        raise RuntimeError('StudyFlow needs Node 24 or newer')
    temporary = config_path.with_suffix('.tmp')
    temporary.write_text(json.dumps(config, indent=2) + '\n')
    temporary.replace(config_path)
    runner = state / 'autodeploy.py'
    temporary = state / 'autodeploy.tmp'
    shutil.copy2(source / 'autodeploy.py', temporary)
    temporary.replace(runner)
    for name in ('studyflow-autodeploy.service', 'studyflow-autodeploy.timer'):
        target = units / name
        if target.exists() and target.read_bytes() != (source / 'systemd' / name).read_bytes():
            shutil.copy2(target, target.with_suffix(target.suffix + '.previous'))
        shutil.copy2(source / 'systemd' / name, target)
    subprocess.run(['systemctl', '--user', 'daemon-reload'], check=True)
    subprocess.run(['systemctl', '--user', 'enable', '--now', 'studyflow-autodeploy.timer'], check=True)
    print('Automatic deployment enabled. Status: systemctl --user status studyflow-autodeploy.timer')


if __name__ == '__main__':
    main()
