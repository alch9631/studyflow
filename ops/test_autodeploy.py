import contextlib
import fcntl
import hashlib
import io
import json
from pathlib import Path
import sqlite3
import tarfile
import tempfile
import time
import unittest
from unittest.mock import Mock
from unittest.mock import patch

from autodeploy import Deployer, ci_result, read_json, write_json


class DeployTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.app = self.root / 'app'
        self.app.mkdir()
        self.schema = 'datasource db { provider = "sqlite" }'
        self.schema_hash = hashlib.sha256(self.schema.encode()).hexdigest()
        self.config = {
            'app_dir': str(self.app), 'state_dir': str(self.root / 'state'),
            'build_root': str(self.root / 'builds'), 'branch': 'main',
            'github_repository': 'example/studyflow', 'workflow': 'ci.yml',
            'node': '/usr/local/bin/node', 'npm': '/usr/local/bin/npm', 'gh': '/usr/bin/gh',
            'service': 'example.service', 'database_file': str(self.root / 'production.db'),
            'health_url': 'http://127.0.0.1:9/api/health', 'health_timeout_seconds': 0.01,
        }
        self.bundle(self.app / '.next', 'old')
        self.deployer = Deployer(self.config)

    def bundle(self, path, name):
        (path / 'standalone/.next').mkdir(parents=True)
        (path / 'standalone/server.js').write_text(name)
        (path / 'BUILD_ID').write_text(name)
        (path / 'standalone/.next/BUILD_ID').write_text(name)
        write_json(path / 'release.json', {'commit': name, 'schemaHash': self.schema_hash})

    def stage(self):
        stage = self.deployer.build_root / 'release-new-fixture'
        stage.mkdir()
        self.bundle(stage / '.next', 'new')
        (stage / 'prisma').mkdir()
        (stage / 'prisma/schema.prisma').write_text(self.schema)
        write_json(stage / 'release-source.json', {'commit': 'new'})
        return stage

    def tick(self, **kwargs):
        with contextlib.redirect_stdout(io.StringIO()):
            return self.deployer.tick(**kwargs)

    def polling(self, ci='success'):
        self.deployer.latest = Mock(return_value='new')
        self.deployer.ci = Mock(return_value=ci)
        self.deployer.prepare = Mock(return_value=self.deployer.build_root / 'release-new-fixture')
        self.deployer.activate = Mock()

    def test_no_deployment_when_already_current(self):
        self.polling()
        self.deployer.latest.return_value = 'old'
        self.tick()
        self.deployer.ci.assert_not_called()
        self.deployer.prepare.assert_not_called()
        self.assertEqual(read_json(self.deployer.state_file)['status'], 'up-to-date')

    def test_only_green_ci_can_start_a_build(self):
        for ci in ('pending', 'failed'):
            with self.subTest(ci=ci):
                self.polling(ci)
                self.tick()
                self.deployer.prepare.assert_not_called()
                self.deployer.activate.assert_not_called()

    def test_success_checks_tip_and_ci_again_before_activation(self):
        self.polling()
        self.tick()
        self.assertEqual(self.deployer.latest.call_count, 2)
        self.assertEqual(self.deployer.ci.call_count, 2)
        self.deployer.activate.assert_called_once()

    def test_clean_build_generates_prisma_without_using_the_live_database(self):
        archive = io.BytesIO()
        with tarfile.open(fileobj=archive, mode='w') as source:
            content = b'{}'
            entry = tarfile.TarInfo('package.json')
            entry.size = len(content)
            source.addfile(entry, io.BytesIO(content))
        commands = []
        def run(args, **kwargs):
            if args[:2] == ['git', 'archive']:
                return archive.getvalue()
            commands.append(args)
            self.assertNotEqual(kwargs['env']['DATABASE_URL'], f"file:{self.config['database_file']}")
            self.assertIn('/prisma/test-build.db', kwargs['env']['DATABASE_URL'])
            if args[1:] == ['run', 'build']:
                self.bundle(kwargs['cwd'] / '.next', 'new')
            return b''
        self.deployer.run = Mock(side_effect=run)
        with contextlib.redirect_stdout(io.StringIO()):
            stage = self.deployer.prepare('new')
        self.assertEqual(commands[0][1], 'ci')
        self.assertEqual(commands[1][-1], 'generate')
        self.assertEqual(commands[2][1:], ['run', 'build'])
        self.assertTrue((stage / '.next/standalone/server.js').is_file())

    def test_a_new_push_supersedes_a_build(self):
        self.polling()
        self.deployer.latest.side_effect = ['new', 'newer']
        self.tick()
        self.deployer.activate.assert_not_called()
        self.assertEqual(read_json(self.deployer.state_file)['status'], 'superseded')

    def test_ci_rerun_blocks_activation_until_green(self):
        self.polling()
        self.deployer.ci.side_effect = ['success', 'pending']
        self.tick()
        self.deployer.activate.assert_not_called()

    def test_failed_build_does_not_touch_live_bundle_and_uses_backoff(self):
        self.polling()
        self.deployer.prepare.side_effect = RuntimeError('bad build')
        with self.assertRaisesRegex(RuntimeError, 'bad build'):
            self.tick()
        self.assertEqual((self.app / '.next/standalone/server.js').read_text(), 'old')
        self.deployer.activate.assert_not_called()
        self.tick()
        self.assertEqual(self.deployer.prepare.call_count, 1)
        with self.assertRaises(RuntimeError):
            self.tick(retry=True)
        self.assertEqual(self.deployer.prepare.call_count, 2)

    def test_new_commit_is_not_held_by_old_failure_backoff(self):
        self.polling()
        self.deployer.state.update(failedCommit='old-bad', retryAfter=time.time() + 600)
        self.tick()
        self.deployer.activate.assert_called_once()

    def test_overlapping_runs_are_locked(self):
        self.polling()
        with (self.deployer.state_dir / 'deploy.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.tick()
        self.deployer.latest.assert_not_called()

    def test_successful_switch_retains_rollback_bundle_and_runtime_settings(self):
        stage = self.stage()
        (self.app / '.env').write_text('EXAMPLE_SETTING=retained\n')
        self.deployer.service = Mock()
        self.deployer.healthy = Mock(return_value=True)
        self.deployer.run = Mock()
        with contextlib.redirect_stdout(io.StringIO()):
            self.deployer.activate(stage, 'new')
        self.assertEqual((self.app / '.next/standalone/server.js').read_text(), 'new')
        self.assertEqual((stage / 'previous-live-next/standalone/server.js').read_text(), 'old')
        self.assertIn('EXAMPLE_SETTING=retained', (self.app / '.next/standalone/.env').read_text())
        self.assertEqual(read_json(self.app / '.next/release.json')['commit'], 'new')
        self.deployer.run.assert_not_called()  # unchanged schema needs no DB operation
        self.assertEqual([c.args[0] for c in self.deployer.service.call_args_list], ['stop', 'start'])

    def test_unhealthy_release_rolls_back(self):
        stage = self.stage()
        self.deployer.service = Mock()
        self.deployer.healthy = Mock(return_value=False)
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaisesRegex(RuntimeError, 'health check'):
            self.deployer.activate(stage, 'new')
        self.assertEqual((self.app / '.next/standalone/server.js').read_text(), 'old')
        self.assertEqual(read_json(self.app / '.next/release.json')['commit'], 'old')
        self.assertTrue((stage / 'failed-next/standalone/server.js').exists())
        self.assertEqual([c.args[0] for c in self.deployer.service.call_args_list], ['stop', 'start', 'stop', 'start'])

    def test_schema_failure_restores_database_and_service(self):
        stage = self.stage()
        (stage / 'prisma/schema.prisma').write_text(self.schema + '\n// changed')
        database = Path(self.config['database_file'])
        with sqlite3.connect(database) as connection:
            connection.execute('CREATE TABLE records (name TEXT)')
            connection.execute("INSERT INTO records VALUES ('kept')")
        def broken_migration(args, **kwargs):
            self.assertNotIn('--accept-data-loss', args)
            self.assertEqual(kwargs['env']['DATABASE_URL'], f'file:{database}')
            with sqlite3.connect(database) as connection:
                connection.execute('DROP TABLE records')
            raise RuntimeError('migration failed')
        self.deployer.run = Mock(side_effect=broken_migration)
        self.deployer.service = Mock()
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaisesRegex(RuntimeError, 'migration failed'):
            self.deployer.activate(stage, 'new')
        with sqlite3.connect(database) as connection:
            self.assertEqual(connection.execute('SELECT name FROM records').fetchone(), ('kept',))
        self.assertEqual((self.app / '.next/standalone/server.js').read_text(), 'old')
        self.assertEqual(self.deployer.service.call_args_list[-1].args, ('start',))

    def test_startup_failure_after_migration_restores_database_too(self):
        stage = self.stage()
        (stage / 'prisma/schema.prisma').write_text(self.schema + '\n// changed')
        database = Path(self.config['database_file'])
        with sqlite3.connect(database) as connection:
            connection.execute('CREATE TABLE records (name TEXT)')
            connection.execute("INSERT INTO records VALUES ('kept')")
        def migration(_args, **_kwargs):
            with sqlite3.connect(database) as connection:
                connection.execute('ALTER TABLE records ADD COLUMN newer TEXT')
        self.deployer.run = Mock(side_effect=migration)
        self.deployer.service = Mock()
        self.deployer.healthy = Mock(return_value=False)
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(RuntimeError):
            self.deployer.activate(stage, 'new')
        with sqlite3.connect(database) as connection:
            self.assertEqual(connection.execute('SELECT * FROM records').fetchone(), ('kept',))
            self.assertEqual(len(connection.execute('PRAGMA table_info(records)').fetchall()), 1)
        self.assertEqual((self.app / '.next/standalone/server.js').read_text(), 'old')

    def test_interrupted_activation_starts_the_previous_version(self):
        stage = self.stage()
        self.deployer.service = Mock()
        self.deployer.healthy = Mock(side_effect=KeyboardInterrupt)
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(KeyboardInterrupt):
            self.deployer.activate(stage, 'new')
        self.assertEqual((self.app / '.next/standalone/server.js').read_text(), 'old')
        self.assertEqual(self.deployer.service.call_args_list[-1].args, ('start',))

    def test_health_requires_ok_true_and_http_200(self):
        def response(value, status=200):
            result = io.BytesIO(json.dumps(value).encode())
            result.status = status
            return result
        with patch('autodeploy.urllib.request.urlopen', return_value=response({'ok': True})):
            self.assertTrue(self.deployer.healthy())
        with patch('autodeploy.urllib.request.urlopen', return_value=response({'ok': False})):
            self.assertFalse(self.deployer.healthy())
        with patch('autodeploy.urllib.request.urlopen', return_value=response({'ok': True}, 503)):
            self.assertFalse(self.deployer.healthy())

    def test_cleanup_only_removes_owned_release_directories(self):
        stages = []
        for n in range(4):
            stage = self.deployer.build_root / f'release-{n}'
            stage.mkdir()
            write_json(stage / 'release-source.json', {'commit': str(n)})
            stages.append(stage)
        unrelated = self.deployer.build_root / 'unrelated'
        unrelated.mkdir()
        self.deployer.cleanup(stages[-1])
        self.assertTrue(unrelated.exists())
        self.assertLessEqual(len(list(self.deployer.build_root.glob('release-*'))), 2)


class CITests(unittest.TestCase):
    def test_exact_sha_branch_push_and_completed_success_are_required(self):
        run = {'id': 1, 'head_sha': 'a', 'head_branch': 'main', 'event': 'push', 'status': 'completed', 'conclusion': 'success'}
        self.assertEqual(ci_result([run], 'a', 'main'), 'success')
        self.assertEqual(ci_result([run], 'b', 'main'), 'pending')
        self.assertEqual(ci_result([{**run, 'event': 'pull_request'}], 'a', 'main'), 'pending')
        self.assertEqual(ci_result([{**run, 'head_branch': 'feature'}], 'a', 'main'), 'pending')
        self.assertEqual(ci_result([{**run, 'status': 'in_progress'}], 'a', 'main'), 'pending')
        self.assertEqual(ci_result([{**run, 'conclusion': 'failure'}], 'a', 'main'), 'failed')

    def test_newer_failed_run_wins_over_an_older_success(self):
        run = {'id': 1, 'head_sha': 'a', 'head_branch': 'main', 'event': 'push', 'status': 'completed', 'conclusion': 'success'}
        self.assertEqual(ci_result([run, {**run, 'id': 2, 'conclusion': 'failure'}], 'a', 'main'), 'failed')


if __name__ == '__main__':
    unittest.main()
