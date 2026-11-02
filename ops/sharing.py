#!/usr/bin/env python3
"""Private SQLite backups and an explicit, backed-up dev-account transfer."""
import argparse
from contextlib import closing
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile


def connect(database, mode='ro'):
    database = Path(database).expanduser().resolve(strict=True)
    connection = sqlite3.connect(database.as_uri() + f'?mode={mode}', uri=True, timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute('PRAGMA foreign_keys=ON')
    return connection


def backup(database, directory, keep=14):
    if keep < 1:
        raise ValueError('Backup retention must be at least one')
    directory = Path(directory).expanduser().resolve()
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    descriptor, temporary = tempfile.mkstemp(prefix='.studyflow-', suffix='.tmp', dir=directory)
    os.close(descriptor)
    temporary = Path(temporary)
    target = directory / f'studyflow-{stamp}.sqlite3'
    try:
        with closing(connect(database)) as source, closing(sqlite3.connect(temporary)) as destination:
            source.backup(destination)
            if destination.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                raise RuntimeError('Backup failed its integrity check')
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    # Prune only our complete backups, after the new one has been verified.
    for old in sorted(directory.glob('studyflow-*.sqlite3'), reverse=True)[keep:]:
        old.unlink()
    return target


PERSONAL_FIELDS = ('preferences', 'calendarToken', 'recoverySnapshot', 'examSchedule')


def transfer_plan(connection, email):
    email = email.strip().lower()
    if not email or email == 'dev@studyflow.local':
        raise ValueError('Supply your real Google email address')
    source = connection.execute('SELECT * FROM User WHERE email = ?', ('dev@studyflow.local',)).fetchone()
    target = connection.execute('SELECT * FROM User WHERE lower(email) = ?', (email,)).fetchone()
    if source is None or target is None:
        raise ValueError('The dev account and your Google account must both exist; sign in with Google first')
    account = connection.execute('SELECT 1 FROM Account WHERE userId = ? AND provider = ?', (target['id'], 'google')).fetchone()
    if account is None:
        raise ValueError('The destination must already be linked to Google sign-in')
    counts = {}
    for table in ('Course', 'Lecture', 'PushSubscription'):
        counts[table] = connection.execute(f'SELECT count(*) FROM {table} WHERE userId = ?', (source['id'],)).fetchone()[0]
    fields = [field for field in PERSONAL_FIELDS if source[field] is not None]
    if not any(counts.values()) and not fields:
        return source, target, counts, fields
    for table in ('Course', 'Lecture'):
        if connection.execute(f'SELECT count(*) FROM {table} WHERE userId = ?', (target['id'],)).fetchone()[0]:
            raise ValueError('Destination already has study data; refusing to merge accounts')
    if any(target[field] is not None for field in fields):
        raise ValueError('Destination has personal settings; refusing to overwrite them')
    return source, target, counts, fields


def claim(database, email, backup_dir, apply=False):
    with closing(connect(database, 'rw' if apply else 'ro')) as connection, connection:
        if apply:
            # Serialize validation and transfer; no writes can invalidate the plan.
            connection.execute('BEGIN IMMEDIATE')
        source, target, counts, fields = transfer_plan(connection, email)
        result = {'destination': target['email'], 'records': counts, 'settings': fields, 'applied': False}
        if not apply or (not any(counts.values()) and not fields):
            return result
        # Use a separate read connection; the reserved write lock allows readers.
        result['backup'] = str(backup(database, backup_dir))
        for table in ('Course', 'Lecture', 'PushSubscription'):
            connection.execute(f'UPDATE {table} SET userId = ? WHERE userId = ?', (target['id'], source['id']))
        if fields:
            # Clear unique calendarToken before assigning it to the Google user.
            connection.execute('UPDATE User SET ' + ', '.join(f'{field} = NULL' for field in fields) + ' WHERE id = ?', (source['id'],))
            connection.execute('UPDATE User SET ' + ', '.join(f'{field} = ?' for field in fields) + ' WHERE id = ?', (*[source[field] for field in fields], target['id']))
        result['applied'] = True
        return result


def systemd_argument(value):
    # systemd specifiers and environment expansion are independent of quoting.
    return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%').replace('$', '$$') + '"'


def install_backups(database, backup_dir, keep):
    database = Path(database).expanduser().resolve(strict=True)
    backup_dir = Path(backup_dir).expanduser().resolve()
    # Validate the actual backup before installing a timer.
    initial = backup(database, backup_dir, keep)
    state = Path.home() / '.local/share/studyflow-backup'
    units = Path.home() / '.config/systemd/user'
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    units.mkdir(parents=True, exist_ok=True)
    shutil.copy2(Path(__file__), state / 'sharing.py')
    config = state / 'config.json'
    config.write_text(json.dumps({'database': str(database), 'backup_dir': str(backup_dir), 'keep': keep}) + '\n')
    config.chmod(0o600)
    command = ' '.join(map(systemd_argument, (sys.executable, state / 'sharing.py', 'backup', '--config', config)))
    (units / 'studyflow-backup.service').write_text(
        '[Unit]\nDescription=Back up Studyflow SQLite\n\n[Service]\nType=oneshot\n'
        'UMask=0077\nNoNewPrivileges=true\n' + f'ExecStart={command}\n')
    (units / 'studyflow-backup.timer').write_text(
        '[Unit]\nDescription=Daily Studyflow backup\n\n[Timer]\nOnCalendar=*-*-* 03:00:00\n'
        'Persistent=true\nRandomizedDelaySec=300\n\n[Install]\nWantedBy=timers.target\n')
    subprocess.run(['systemctl', '--user', 'daemon-reload'], check=True)
    subprocess.run(['systemctl', '--user', 'enable', '--now', 'studyflow-backup.timer'], check=True)
    return {'backup': str(initial), 'timer': 'studyflow-backup.timer', 'keep': keep}


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    for name in ('backup', 'claim', 'install-backups'):
        command = commands.add_parser(name)
        command.add_argument('--database', type=Path)
        command.add_argument('--backup-dir', type=Path, default=Path.home() / '.local/share/studyflow-backups')
        command.add_argument('--keep', type=int, default=14)
        if name == 'backup':
            command.add_argument('--config', type=Path)
        if name == 'claim':
            command.add_argument('--email', required=True)
            command.add_argument('--apply', action='store_true', help='Apply the previewed transfer after making a verified backup')
    args = parser.parse_args()
    if getattr(args, 'config', None):
        settings = json.loads(args.config.read_text())
        args.database = Path(settings['database'])
        args.backup_dir = Path(settings['backup_dir'])
        args.keep = settings['keep']
    if not args.database:
        parser.error('--database is required (or --config for backup)')
    try:
        if args.command == 'backup':
            result = {'backup': str(backup(args.database, args.backup_dir, args.keep))}
        elif args.command == 'claim':
            result = claim(args.database, args.email, args.backup_dir, args.apply)
        else:
            result = install_backups(args.database, args.backup_dir, args.keep)
        print(json.dumps(result, indent=2))
    except (ValueError, RuntimeError, OSError, sqlite3.Error) as error:
        parser.exit(1, f'{error}\n')


if __name__ == '__main__':
    main()
