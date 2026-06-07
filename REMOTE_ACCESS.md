# Remote access — reach StudyFlow (and your PC) from your phone

Goal: from your phone, anywhere, **view the running app** and **pull/restart the
dev server** without being at the computer. Set this up once at the desk (~5 min).
Uses [Tailscale](https://tailscale.com) (a private, secure mesh VPN) + SSH.

## On your Mac (once)
1. Install Tailscale:
   ```bash
   brew install --cask tailscale
   ```
   (or download the app from tailscale.com)
2. Sign in (Google/GitHub/email) and bring it up:
   ```bash
   tailscale up
   ```
3. Enable SSH so you can run commands from your phone:
   **System Settings → General → Sharing → Remote Login → On.**
4. Find your Mac's tailnet address:
   ```bash
   tailscale ip -4      # e.g. 100.101.102.103
   ```

## On your iPhone (once)
5. Install the **Tailscale** app, sign in with the **same account**.
   Your phone and Mac now share a private network — works on cellular too.

## Before you leave the desk — make it survive while you're away

Three things must be true, or the server dies when you walk away:

**1. Keep the Mac awake** (a sleeping Mac = unreachable server)
- System Settings → **Battery / Lock Screen → "Prevent automatic sleeping on
  power adapter"** (keep it plugged in), **or** just run the server under
  `caffeinate` (next step) which keeps it awake while it runs.

**2. Run the server so it survives the terminal closing** (no install needed)
   ```bash
   cd studyflow
   caffeinate -s nohup npm run fresh > ~/sf.log 2>&1 &
   ```
   `nohup … &` keeps it running after you close the terminal; `caffeinate -s`
   keeps the Mac awake; logs go to `~/sf.log`. You can now close the terminal.
   (Prefer a reattachable session? `brew install tmux`, then
   `tmux new -s sf` → `caffeinate -s npm run fresh` → detach with `Ctrl-b`, `d`.)

## Then, from your phone — anytime
- **View the app:** open a browser →
  `http://100.x.y.z:3000`  (your Mac's Tailscale IP + the dev port)
- **Pull my latest update + refresh the server:** use an SSH app (**Termius** or
  **Blink**) → connect to `your-mac-user@100.x.y.z` → run the same one-liner:
  ```bash
  cd studyflow && git pull && caffeinate -s nohup npm run fresh > ~/sf.log 2>&1 &
  ```
  `npm run fresh` auto-kills the running server, syncs the DB + regenerates the
  Prisma client, and restarts with the new code — so it always works after a pull.

## Handy checks
```bash
curl -s localhost:3000 >/dev/null && echo "running"   # is it up?
tail -f ~/sf.log                                       # watch logs
pkill -f next-server                                   # stop it
```

## Notes
- Tailscale traffic is end-to-end encrypted and private to your devices — the
  app is **not** exposed to the public internet (that's what Vercel is for; see
  PRODUCTION.md when you want a real public URL).
- This whole dance disappears once the app is **deployed** (Vercel): then it's a
  public URL that's always up, no Mac required. This is the bridge until then.
