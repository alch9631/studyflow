# Automatic deployment on the Pi

`studyflow-autodeploy.timer` checks GitHub `main` every minute. A new commit is
deployed after the **CI** workflow (`ci.yml`, push event, exact commit SHA) passes.
The app still runs as the existing `studyflow.service` on port 3000.

The deployer exports a clean Git snapshot into `~/.cache/studyflow-deploy`, runs
`npm ci` and the production build there, then switches the standalone bundle.
Builds use a separate SQLite path and receive no production `.env` files.
The developer checkout and its unfinished changes are not checked out or reset.

Before activation it checks for a newer push and verifies CI again. Releases are
serialized by a file lock, including manual runs through `ops/deploy.sh`.
The production service is stopped only for the bundle switch and any required
schema sync. Startup must return HTTP 200 with `ok: true` from `/api/health`.
An unsuccessful start restores the previous bundle and starts it again.

When the Prisma schema changes, the deployer backs up the local SQLite database
and runs `prisma db push --skip-generate`, without accepting data loss. A failed
schema sync or startup also restores that backup. Changes that Prisma cannot
apply safely need a separate migration before that release can deploy.

Failed builds retry after ten minutes; new commits are checked immediately on
the next timer tick. Two build directories and five schema-change database
backups are retained. Logs are in the user journal.

## Install or update the deployer

Prerequisites: Node 24+, npm, Python 3.12+, and an authenticated GitHub CLI with
repository read access. The existing Pi has these. User lingering must be enabled
for the timer to run after reboot without an interactive login.

```bash
python3 ops/install_autodeploy.py
```

The installer preserves existing settings in
`~/.config/studyflow-deploy/config.json` and installs a stable copy of the runner
under `~/.local/share/studyflow-deploy`. Run it again after changing the deployment
scripts to update that installed copy. Existing unit files are backed up before
replacement. Authentication and application service configuration are reused.

## Status and controls

```bash
systemctl --user status studyflow-autodeploy.timer
journalctl _SYSTEMD_USER_UNIT=studyflow-autodeploy.service -n 80 --no-pager
python3 ~/.local/share/studyflow-deploy/autodeploy.py --config ~/.config/studyflow-deploy/config.json --status
cat .next/release.json

# Check now (CI must still pass).
systemctl --user start studyflow-autodeploy.service

# Retry a failed deployment without waiting for the ten-minute cooldown.
bash ops/deploy.sh

# Stop future automatic checks, keeping the app running.
systemctl --user disable --now studyflow-autodeploy.timer
```

The deployed commit is recorded in `.next/release.json`. The developer checkout
can be behind that commit, since automatic deployment does not edit local work.

## Verify the deployment logic

```bash
python3 -m unittest discover -s ops -p 'test_autodeploy.py'
```

The tests use temporary directories and SQLite databases. They cover the CI
gate, stale commits, overlapping runs, build failures, release rollback, and
database restoration without stopping the actual application.
