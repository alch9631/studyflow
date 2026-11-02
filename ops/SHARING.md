# Share Studyflow from the Pi

Run one production app with Google accounts and a permanent HTTPS link.
Each student owns their courses, notes, uploaded files, calendar and settings.
The shared university module catalog stays available to everyone.

## 1. Configure the permanent URL and Google sign-in

The existing Pi already has a persistent Tailscale Funnel route:

```text
https://avi-pi.tail76033e.ts.net:8443 → http://127.0.0.1:3000
```

Use this hostname; friends do not need Tailscale installed. Keep port 8443 in
the public URL and Google redirect URI. Other ports on the Pi serve other apps;
do not reset Funnel or replace the routes on ports 443/10000.

For a fresh Pi, enable a persistent route with
`tailscale funnel --bg --https=8443 http://127.0.0.1:3000` after authentication is
configured. See <https://tailscale.com/docs/features/tailscale-funnel>.
Keep the app bound to loopback. Do not use a temporary Quick Tunnel URL for
Google sign-in or installed home-screen apps. A Cloudflare named tunnel and your
own domain are also supported; set `AUTH_URL` and Google's callback accordingly.

In Google Cloud, create an **External** OAuth consent screen and a **Web
application** OAuth client. Add this exact authorized redirect URI:

```text
https://avi-pi.tail76033e.ts.net:8443/api/auth/callback/google
```

Use only the standard `openid`, `email`, `profile` scopes. For arbitrary Google
accounts, choose an External audience and publish the OAuth app to Production
in Google Cloud's Audience settings. Basic identity scopes are exempt from some
Testing-mode limits, but Production is the intended sharing configuration.

Prepare the private runtime configuration:

```bash
npm run sharing:prepare
```

This creates `~/.config/studyflow/sharing.env` with private permissions and a
random session secret, preserving the file on subsequent runs. Edit that file
locally: add the Google client ID/secret. The existing Pi URL is prefilled. Leave
`AUTH_ALLOWED_EMAILS` empty so anyone with a verified Google account can sign up.
Keep the existing absolute database path; do not copy the database into `.next`
or a build directory. For another Pi, use its actual database path.

Check the file from the project directory:

```bash
node --env-file="$HOME/.config/studyflow/sharing.env" scripts/check-sharing.mjs
```

The checker names missing settings without printing credentials. A passing
configuration check does not verify DNS, OAuth credentials or live account
separation. Those are checked below. Google admits only verified email profiles.
You can optionally restrict access later by setting `AUTH_ALLOWED_EMAILS` to exact
email addresses. Restarting applies that list to existing server sessions too.

## 2. Ship the prepared changes and activate real sign-in

Review and ship these changes to `main`. The existing auto-deployer waits for
CI to pass before installing the release. Local uncommitted changes are not
deployed by that timer.

After the new release is installed and the private environment file passes the
check, install the prepared systemd drop-in:

```bash
install -d "$HOME/.config/systemd/user/studyflow.service.d"
install -m 600 ops/systemd/studyflow-sharing.conf "$HOME/.config/systemd/user/studyflow.service.d/zz-sharing.conf"
systemctl --user daemon-reload
systemctl --user restart studyflow.service
```

The environment file overrides older shared-dev-user settings in the service.
Leave `ALLOW_DEV_USER=0`; running `next dev` also uses the shared account, so the
public tunnel must always point at the production service.

## 3. Move your current study data to your Google account

Sign in with your own Google account once, then leave it empty. Your old
data stays on `dev@studyflow.local` until this explicit transfer; new friends
start with their own empty account. Preview the transfer on the Pi:

```bash
python3 ops/sharing.py claim --database /home/pipi/.openclaw/workspace/studyflow/prisma/dev.db --email YOUR-GOOGLE-EMAIL
```

Review the counts, then apply the same command with `--apply`. The tool creates
and checks a private backup before moving anything. It preserves course IDs and
their topics, task history, files and notes, moves lectures and subscriptions,
and carries over personal preferences and the calendar token. It refuses to
overwrite destination study data or conflicting settings, and a completed
transfer is safe to run again. Refresh after transferring.

## 4. Enable daily backups

```bash
python3 ops/sharing.py install-backups --database /home/pipi/.openclaw/workspace/studyflow/prisma/dev.db
systemctl --user status studyflow-backup.timer
```

This makes a first verified backup, installs a stable copy of the backup tool
outside the checkout, and schedules an online SQLite backup around 03:00 daily.
It keeps 14 complete backups in `~/.local/share/studyflow-backups`, including
uploaded originals stored in the database. Files are private to the Pi user.
SQLite's backup API includes committed WAL changes without stopping the app.
Copy these backups to a separate disk/device for protection against Pi storage
failure. The auto-deployer's schema-change backups remain separate.

To restore, stop the app, preserve the current database and any `-wal`/`-shm`
sidecars, copy the chosen backup to the configured database path, remove the old
sidecars from that path, then start the service and check `/api/health`. Never
replace the database while the app is running.

## 5. Verify before sending the link

- The public URL uses HTTPS. `/api/health` returns `{"ok":true}`.
- Signed-out `/today` redirects to `/login`.
- Your Google sign-in completes and shows your transferred courses.
- A friend signing in from a separate browser profile starts with an empty plan.
- Create a course in each account. Each account sees only its own course in the
  UI and `/api/export`; opening the other's course or material URL is rejected.
- A new, arbitrary Google account can sign in and starts with an empty plan.
- Sign out, sign in as another account, then go offline: the previous account's
  pages and focus drafts are unavailable.
- Confirm `studyflow-autodeploy.timer` and `studyflow-backup.timer` are active.

Friends can open the same link in Safari/Chrome and use **Add to Home Screen**.
Their study data stays in their account on the Pi. The Pi and internet connection
must remain online for synchronization and AI features.

## Updates

Push to `main` → CI passes → Pi builds and activates the release. See
[AUTO_DEPLOY.md](AUTO_DEPLOY.md) for rollback and status. Browser/PWA sessions
check the uncached `/api/version` on opening, returning to the app and once a
minute while visible. A changed build shows **An update is ready · Refresh**.
Refresh is a deliberate full reload and waits for offline changes to sync;
the app never reloads automatically during study. A fresh online load gets the
deployed version. Offline use continues with the last synchronized pages.

## Checks for this change

```bash
npm run test:sharing
npm run test:ownership
npm run test:serviceworker
python3 -m unittest discover -s ops -p 'test_autodeploy.py'
npm run lint
npx tsc --noEmit
npm run build
```
