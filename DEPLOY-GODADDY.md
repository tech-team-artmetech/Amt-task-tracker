# Hosting AMT Task Tracker on GoDaddy cPanel hosting

The app is a Node.js server (Express) that keeps its data in one SQLite file on disk.
It can run on cPanel hosting **only if the plan has the "Setup Node.js App" tool**
(CloudLinux Node.js Selector). The `artmetech.in` Web Hosting Deluxe plan did not show it
when we searched cPanel, so step 0 is mandatory.

## 0. Ask GoDaddy to enable Node.js (one time)

Open GoDaddy chat/phone support and ask:

> Please enable "Setup Node.js App" (CloudLinux Node.js Selector) on my Web Hosting Deluxe
> plan for artmetech.in, with Node.js 20 or newer. If it is not available on this plan,
> which plan includes it? Also: what is the memory (RAM) and process limit, and is a
> Terminal / SSH available in cPanel?

If they say it is not available, stop here. This app cannot run on that plan, and the options are
a GoDaddy VPS, or another Node-capable host (for example a small AWS EC2 / Lightsail server).
The same build works there too: see "Other hosts" at the bottom.

## 1. Build the app on your PC

```powershell
cd "C:\Users\HP\Downloads\amt-task-tracker (1)"
npm install
npm run build
```

This creates `dist/` (the website plus `dist/server.cjs`, the server).

Make a zip containing exactly these (do **not** include `node_modules`, `data`, `.env`, `.git`):

- `dist/`
- `public/`
- `package.json`
- `package-lock.json`

## 2. Export the current live data (do this at cut-over time, see step 6)

The old Cloud Run app saves its database to Firestore. Download the latest copy:

```powershell
node tools/export-firestore-snapshot.mjs data/whiteboard.sqlite
```

It prints when that snapshot was last saved. **Check the time is recent.**
If it is old, the cloud copy was stale; ask me before going further.

## 3. Upload to cPanel

In cPanel File Manager (or FTP), under your **home folder** (not `public_html`):

1. Create the folder `amt-task-tracker` and extract the zip into it.
2. Create the folder `amt-data` (the database lives here, outside the code and website folders).
3. Upload `whiteboard.sqlite` from step 2 into `amt-data/`.

## 4. Create the Node.js app in cPanel

cPanel -> **Setup Node.js App** -> **Create Application**:

| Field | Value |
|---|---|
| Node.js version | 20 or newer |
| Application mode | Production |
| Application root | `amt-task-tracker` |
| Application URL | the subdomain to use (start with a test one, e.g. `taskboard.artmetech.in`) |
| Application startup file | `dist/server.cjs` |

Add these **environment variables** (see `.env.example`):

| Name | Value |
|---|---|
| `JWT_SECRET` | a new random 40+ character string |
| `GEMINI_API_KEY` | your Gemini key |
| `DATA_DIR` | `/home/<your-cpanel-username>/amt-data` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | the values currently used (top of `server/notifications.ts`), so existing browser notification subscriptions keep working |

Click **Run NPM Install**, then **Start App** (or Restart).

Open the URL. Check `https://<your-url>/_healthz` shows `OK`, then log in.

## 5. Check before switching

- Log in as an admin; the board, yesterday's ticks and comments are there.
- Tick a task, add a comment, then press **Restart** in the Node.js app screen and confirm both are still there.
- Upload a whiteboard photo (checks the Gemini key).

## 6. Cut over from Cloud Run

1. Tell the team: no changes during the move (about 15 minutes).
2. Re-run step 2 (fresh export), re-upload `whiteboard.sqlite` to `amt-data/`, restart the app.
3. Point `tasktracker.artmetech.in` at the new app: add it as the Application URL
   (create it as a domain/subdomain in cPanel, remove or change its current DNS record that
   points to Cloud Run, and let AutoSSL issue the certificate; allow up to a few hours).
4. Keep Cloud Run running (but unused) for a week as a fallback, then switch it off.

## 7. Backups

The app keeps one copy per day for 14 days in `amt-data/backups/`. That is on the same server,
so also download `amt-data/whiteboard.sqlite` to your PC weekly (File Manager -> Download), or
enable GoDaddy's account backups.

## 8. Security clean-up (important)

- **Rotate every account password** in User Management. The old app exposed the seeded passwords
  to anyone through a public URL and printed them in logs, and they are also written in
  `server/db.ts`. Treat them as known. (This build no longer accepts the original seed
  password after it has been changed.)
- **Lock Firestore** once the move is verified: in the Firebase console -> Firestore -> Rules,
  replace the rules with `allow read, write: if false;`. At the moment anyone could read the whole
  database snapshot (users and password hashes) and overwrite it.
- Keep the GitHub repository **private**, and remove the passwords from `server/db.ts`
  when convenient (they are only needed to create a brand-new database).
- Change the VAPID keys if you ever make the repository public (everyone must re-enable notifications).

## What changed in the code (for reference)

- The database is saved straight to disk (`DATA_DIR`) after every change, using a temp file + rename;
  no Firestore, no cloud snapshot, nothing to go stale. A clean shutdown also saves once more.
- Removed Firebase sign-in, `/api/auth/seed-users`, `/api/auth/quick-switch`, `/api/board/seed-15-days`.
- Tokens are signed only with `JWT_SECRET`; the server refuses to start in production without it.
- Approving a task is admin-only on the server, login attempts are rate-limited, and passwords
  are no longer printed in logs.
- `npm start` now runs the built server (`dist/server.cjs`).

## Troubleshooting

- **App shows an error page / 503**: cPanel -> Setup Node.js App -> check the app's log (stderr.log) in the app root.
  A common cause is a missing `JWT_SECRET`.
- **Board is empty after start**: `DATA_DIR` points to the wrong folder, so a new empty database was created. Fix the variable and restart.
- **Out of memory / app keeps restarting**: ask GoDaddy for the process/RAM limits; this is the risk of shared hosting.
- **Live notifications lag**: the board still refreshes every few seconds on its own; only the instant
  notification stream is affected by shared-hosting connection limits.

## Other hosts (VPS / EC2)

Same build. Install Node 20, upload the same files, set the same environment variables
(`NODE_ENV=production`, `PORT=3000`), run `npm install --omit=dev` and `npm start` under `pm2`/`systemd`,
and put nginx (or Caddy) with HTTPS in front.
