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

## Then, from your phone — anytime
- **View the app:** open a browser →
  `http://100.x.y.z:3000`  (your Mac's Tailscale IP + the dev port)
- **Pull latest / restart the server:** use an SSH app (**Termius** or **Blink**) →
  connect to `your-mac-user@100.x.y.z` → run:
  ```bash
  cd studyflow && git pull && npm install && npm run dev
  ```

## Notes
- `npm run dev` keeps that SSH session busy. To leave it running after you
  disconnect, start it under tmux: `tmux new -s sf` → run dev → detach with
  `Ctrl-b d`. Reattach later with `tmux attach -t sf`.
- Tailscale traffic is end-to-end encrypted and private to your devices — the
  app is **not** exposed to the public internet (that's what Vercel is for; see
  PRODUCTION.md when you want a real public URL).
- Your Mac must be **awake** to reach it (System Settings → keep awake on power).
