# AMT Task Tracker

A web app that mirrors the office task whiteboard. An admin photographs the handwritten tasklist; the server reads it with **Gemini Vision**, extracts each team member's tasks in priority order, and shows an editable **Review Screen** for fixing handwriting misreads. On confirmation the new board is published: every team member is a column, with their tasks ordered by priority.

---

## Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS, Lucide Icons, Motion
- **Backend**: Node.js, Express (`server.ts` plus `server/`), bundled with esbuild for production
- **Database**: SQLite via `sql.js`, saved to a single file on disk (`DATA_DIR/whiteboard.sqlite`) after every change, with 14 daily backups in `DATA_DIR/backups`
- **AI**: Gemini Vision through the `@google/genai` SDK, server-side only. Regular Gemini API keys and Agent Platform (Vertex AI) keys are both supported
- **Authentication**: email + password, bcrypt password hashing, JSON Web Tokens signed with `JWT_SECRET`
- **Notifications**: in-app notifications over Server-Sent Events, plus browser Web Push (VAPID)

---

## Accounts & Roles

There is no public sign-up, quick-login or demo role switch. Accounts are created by an admin in **User Management**.

On a brand-new database the server creates the team's initial accounts (defined in `server/db.ts`). Their passwords are never printed to the logs, and once an admin changes a password the original one stops working. Change every initial password after the first start.

| Role | Can do |
|---|---|
| **Admin** | Upload whiteboard photos, review and publish boards, edit people and tasks, approve completed tasks, manage users, roles and manager assignments, view monthly reports |
| **Manager** | Reorder task priorities within and between columns, edit tasks, set column departments |
| **Team roles** (e.g. Editors, Designers, Cinematographers, or custom roles) | View the board, tick off tasks and comment |

Role checks are enforced by the Express server, not only in the UI.

---

## Run Locally

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
Copy `.env.example` to `.env` and fill in at least:
```env
JWT_SECRET="a random string of 40+ characters"
GEMINI_API_KEY="your-gemini-api-key"
```
See `.env.example` for the rest (`DATA_DIR`, `VAPID_*`). Optional Gemini settings:

- `GEMINI_USE_VERTEX=true` when the key is an Agent Platform (Vertex AI) key
- `GEMINI_MODELS` (comma-separated) to try specific models before the built-in fallback list

### 3. Start the dev server
```bash
npm run dev
```
The app runs on `http://localhost:3000`. Without `DATA_DIR` the database is created in `./data/`.

### 4. Production build
```bash
npm run build
npm start
```
`npm start` runs `dist/server.cjs` and refuses to start without `JWT_SECRET` when `NODE_ENV=production`.

### Checks
```bash
npm run lint   # TypeScript type check
```

---

## Deployment

See [DEPLOY-GODADDY.md](DEPLOY-GODADDY.md) for hosting on GoDaddy cPanel ("Setup Node.js App"), the one-time data export from the old Cloud Run deployment, and the post-move security clean-up. The same build runs on any host with Node.js 20+.

---

## Core Flow & Features

1. **Upload board photo**: the admin uploads a JPG/PNG/WEBP, takes a webcam snapshot, or picks a built-in sample whiteboard.
2. **Gemini Vision extraction**: the server sends the photo to Gemini and gets back `{ employees: [{ name, tasks[] }] }`. An unreadable photo returns "Couldn't read the board, try a clearer photo".
3. **Review screen**: alongside the photo, the admin can rename, add or remove people, edit task text, reorder tasks and add or delete tasks.
4. **Publish**: the reviewed board becomes the live board for the selected date.
5. **Live board**:
   - One column per team member with their avatar, department, manager badge and a task counter (counts task quantities such as "3 reels").
   - Tasks stacked in priority order; the top task is marked highest priority.
   - Drag and drop to reorder within a column or move a task to another person (managers and admins).
   - Tick tasks complete, admin approval, and comments on tasks.
   - Date selector to look at earlier days, and a monthly report.
   - The board refreshes itself every few seconds, so it works on a wall-mounted screen.
