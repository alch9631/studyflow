from contextlib import closing
import os
from pathlib import Path
import shutil
import sqlite3
import stat
import subprocess
import tempfile
import unittest

from sharing import backup, claim


class SharingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.template_dir = tempfile.TemporaryDirectory(prefix='studyflow-sharing-test-')
        cls.template = Path(cls.template_dir.name) / 'template.db'
        cls.template.touch()  # Prisma's SQLite engine may require an existing file.
        app = Path(__file__).resolve().parent.parent
        subprocess.run([shutil.which('node'), str(app / 'node_modules/prisma/build/index.js'),
                        'db', 'push', '--skip-generate', '--schema', str(app / 'prisma/schema.prisma')],
                       env=dict(os.environ, DATABASE_URL=f'file:{cls.template}'), check=True,
                       stdout=subprocess.DEVNULL)

    @classmethod
    def tearDownClass(cls):
        cls.template_dir.cleanup()

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='studyflow-sharing-test-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.database = self.root / 'test.db'
        self.backups = self.root / 'backups'
        shutil.copy2(self.template, self.database)
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute('PRAGMA foreign_keys=ON')
            for user_id, email in [('dev', 'dev@studyflow.local'), ('owner', 'owner@school.de'), ('friend', 'friend@school.de')]:
                db.execute('INSERT INTO User (id, email) VALUES (?, ?)', (user_id, email))
            db.execute('INSERT INTO Account (id,userId,type,provider,providerAccountId) VALUES (?,?,?,?,?)',
                       ('google-owner', 'owner', 'oauth', 'google', 'google-owner-id'))
            db.execute('UPDATE User SET preferences=?,calendarToken=?,examSchedule=? WHERE id=?',
                       ('{"minutes":60}', 'private-calendar', 'saved-exams', 'dev'))
            for user_id in ('dev', 'friend'):
                db.execute('INSERT INTO Course (id,name,examDate,userId) VALUES (?,?,?,?)',
                           (f'course-{user_id}', f'{user_id} course', '2027-02-01', user_id))
            db.execute('INSERT INTO Topic (id,title,courseId,studyProgress) VALUES (?,?,?,?)',
                       ('topic', 'Retained topic', 'course-dev', 'saved answer'))
            db.execute('INSERT INTO FocusNote (id,body,topicId,updatedAt) VALUES (?,?,?,CURRENT_TIMESTAMP)',
                       ('note', 'Private note', 'topic'))
            db.execute('INSERT INTO ModuleFile (id,courseId,filename,content) VALUES (?,?,?,?)',
                       ('file', 'course-dev', 'script.pdf', b'original material'))
            db.execute('INSERT INTO Lecture (id,title,weekday,startMin,endMin,userId) VALUES (?,?,?,?,?,?)',
                       ('lecture', 'Class', 1, 600, 660, 'dev'))
            db.execute('INSERT INTO PushSubscription (id,endpoint,p256dh,auth,userId) VALUES (?,?,?,?,?)',
                       ('push', 'https://push.school.de/dev', 'public-key', 'auth-key', 'dev'))

    def query(self, sql, parameters=()):
        with closing(sqlite3.connect(self.database)) as db:
            return db.execute(sql, parameters).fetchall()

    def test_backup_includes_wal_and_has_private_permissions(self):
        with closing(sqlite3.connect(self.database)) as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute("UPDATE Topic SET studyProgress='latest committed answer'")
            db.commit()
            target = backup(self.database, self.backups)
            with closing(sqlite3.connect(target)) as restored:
                self.assertEqual(restored.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
                self.assertEqual(restored.execute('SELECT studyProgress FROM Topic').fetchone()[0], 'latest committed answer')
        self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o600)

    def test_retention_keeps_other_files(self):
        for _ in range(4):
            backup(self.database, self.backups, keep=2)
        self.assertEqual(len(list(self.backups.glob('studyflow-*.sqlite3'))), 2)
        other = self.backups / 'manual.sqlite3'
        other.write_text('keep')
        backup(self.database, self.backups, keep=1)
        self.assertTrue(other.exists())
        with self.assertRaises(ValueError):
            backup(self.database, self.backups, keep=0)

    def test_preview_does_not_write(self):
        result = claim(self.database, 'OWNER@school.de', self.backups)
        self.assertFalse(result['applied'])
        self.assertEqual(result['records']['Course'], 1)
        self.assertEqual(self.query("SELECT userId FROM Course WHERE id='course-dev'"), [('dev',)])
        self.assertFalse(self.backups.exists())

    def test_transfer_preserves_materials_notes_settings_and_other_user(self):
        result = claim(self.database, 'owner@school.de', self.backups, apply=True)
        self.assertTrue(result['applied'])
        self.assertTrue(Path(result['backup']).is_file())
        self.assertEqual(self.query('SELECT id,userId FROM Course ORDER BY id'), [('course-dev', 'owner'), ('course-friend', 'friend')])
        self.assertEqual(self.query('SELECT body FROM FocusNote'), [('Private note',)])
        self.assertEqual(self.query('SELECT content FROM ModuleFile'), [(b'original material',)])
        self.assertEqual(self.query('SELECT userId FROM Lecture'), [('owner',)])
        self.assertEqual(self.query('SELECT userId FROM PushSubscription'), [('owner',)])
        self.assertEqual(self.query("SELECT preferences,calendarToken,examSchedule FROM User WHERE id='owner'"),
                         [('{"minutes":60}', 'private-calendar', 'saved-exams')])
        self.assertEqual(self.query("SELECT preferences,calendarToken FROM User WHERE id='dev'"), [(None, None)])
        self.assertFalse(claim(self.database, 'owner@school.de', self.backups, apply=True)['applied'])
        with closing(sqlite3.connect(result['backup'])) as previous:
            self.assertEqual(previous.execute("SELECT userId FROM Course WHERE id='course-dev'").fetchone()[0], 'dev')

    def test_refuses_overwriting_existing_settings_or_unlinked_account(self):
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute("UPDATE User SET preferences='existing' WHERE id='owner'")
        with self.assertRaisesRegex(ValueError, 'settings'):
            claim(self.database, 'owner@school.de', self.backups, apply=True)
        with self.assertRaisesRegex(ValueError, 'linked to Google'):
            claim(self.database, 'friend@school.de', self.backups, apply=True)
        self.assertEqual(self.query("SELECT userId FROM Course WHERE id='course-dev'"), [('dev',)])
        self.assertFalse(self.backups.exists())

    def test_missing_database_is_not_created(self):
        missing = self.root / 'missing.db'
        with self.assertRaises(FileNotFoundError):
            backup(missing, self.backups)
        self.assertFalse(missing.exists())
        self.assertEqual(list(self.backups.iterdir()), [])

    def test_failed_transfer_rolls_back_all_account_changes(self):
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute("CREATE TRIGGER refuse_transfer BEFORE UPDATE ON Lecture WHEN NEW.userId='owner' BEGIN SELECT RAISE(ABORT, 'test failure'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            claim(self.database, 'owner@school.de', self.backups, apply=True)
        self.assertEqual(self.query("SELECT userId FROM Course WHERE id='course-dev'"), [('dev',)])
        self.assertEqual(self.query("SELECT calendarToken FROM User WHERE id='dev'"), [('private-calendar',)])
        self.assertEqual(self.query("SELECT calendarToken FROM User WHERE id='owner'"), [(None,)])
        self.assertEqual(len(list(self.backups.glob('studyflow-*.sqlite3'))), 1)


if __name__ == '__main__':
    unittest.main()
