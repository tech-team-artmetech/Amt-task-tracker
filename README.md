# AMT Task Tracker

A web application that mirrors an office task tracker. An admin photographs the office tasklist; the app reads the handwritten photo with **Gemini Vision (Gemini 3.8 Flash)**, extracts each team member's task list in priority order, displays an editable **Review Screen** for correcting OCR handwriting misreads, and on confirmation publishes the live board where every employee is a column with their tasks ordered by priority.

---

## Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS, Lucide Icons, Motion
- **Backend**: Node.js, Express, ESBuild
- **Database**: SQLite (via `sql.js` WebAssembly SQLite engine), structured with relational tables (`users`, `board_meta`, `board_columns`, `board_tasks`) for straightforward migration to PostgreSQL
- **AI**: Gemini Vision (`gemini-3.8-flash`) via the modern `@google/genai` TypeScript SDK (server-side with `process.env.GEMINI_API_KEY`)
- **Authentication**: Email + password, Bcrypt password hashing (`bcryptjs`), JSON Web Tokens (`jsonwebtoken`)

---

## Seed Accounts & Logins

The application automatically seeds three role accounts on first launch and prints credentials to the terminal console:

| Role | Name | Email | Password | Permissions |
|---|---|---|---|---|
| **Admin** | Alex Admin | `admin@office.local` | `adminPassword123!` | Upload whiteboard photos, publish boards, full edit (people & tasks), reorder |
| **Manager** | Morgan Manager | `manager@office.local` | `managerPassword123!` | Drag to reorder task priorities within and between columns. Cannot upload or add new tasks |
| **Employee** | Elena Employee | `employee@office.local` | `employeePassword123!` | View only (laptop or wall-mounted screen) |

> **Quick Login Tip**: The login screen features 1-click quick-login buttons for each role for instant evaluation. The navigation bar also includes a "Demo Role" switch to toggle roles on the fly.

---

## Exact Run Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Secrets
Ensure `.env` contains your Gemini API key (automatically injected in Google AI Studio):
```env
GEMINI_API_KEY="your-gemini-api-key"
JWT_SECRET="whiteboard_jwt_secret_change_in_production"
```

### 3. Run Development Server
```bash
npm run dev
```
The server will start on port 3000 (`http://localhost:3000`). Database tables will be created automatically and seed accounts will be populated.

### 4. Production Build & Start
```bash
npm run build
npm start
```

---

## Core Flow & Features

1. **Upload Board Photo**:
   - The Admin clicks **"Upload Board Photo"** from the navigation bar or empty state.
   - Admin can upload a file (JPG, PNG, WEBP), take a snapshot directly via webcam, or choose one of the preloaded **Sample Whiteboards** (e.g. Sprint Board with Aisha, Rohan, and Marcus).
2. **Gemini Vision Extraction**:
   - The photo is transmitted to the server-side Gemini 3.8 Flash model with the instructed prompt.
   - Gemini Vision returns structured JSON matching `{ employees: [{ name: string, tasks: string[] }] }`.
   - If an unreadable or completely blurry photo is uploaded, it gracefully returns: `"Couldn't read the board, try a clearer photo"`.
3. **Editable Review Screen (Step 3)**:
   - Handwriting OCR is never perfect. The Admin is shown an editable Review Screen alongside the reference photo.
   - Admin can:
     - Rename, add, or remove employees.
     - Edit task text inline.
     - Reorder tasks up/down to adjust priority.
     - Add or delete tasks.
4. **Publish & Replace (Step 4)**:
   - Upon confirming publish, the new board **replaces the previous board entirely** in a single atomic transaction.
   - The old board is discarded; only the latest published board is stored and displayed.
5. **Interactive Priority Board UI**:
   - One column per team member with their avatar and task counter.
   - Tasks are stacked top-to-bottom in priority order; the topmost task is highlighted with a `#1 Highest Priority` badge.
   - **Manager & Admin Reordering**: Drag and drop tasks within a column to adjust priority, or across columns to reassign to another team member.
   - **Backend Role Enforcement**: Managers attempting to publish or upload are rejected by Express backend middleware (`requireRole(['admin'])`). Employees have drag-and-drop disabled and view-only permissions.
   - **Wall Display / TV Mode**: A toggle in the top bar switches to high-contrast, larger-text mode optimized for 10-foot office TV displays with auto-refresh every 30 seconds.

---

## Assumptions & Design Choices

1. **Database Structure**: Implemented relational tables (`users`, `board_meta`, `board_columns`, `board_tasks`) in SQLite via `sql.js` (WebAssembly SQLite). Foreign keys and order columns are used so the schema can be migrated directly to PostgreSQL with standard DDL.
2. **Board Replacement**: Per prompt specifications, no historical archive is retained. Each publish drops existing `board_tasks` and `board_columns` and populates the fresh verified dataset.
3. **Wall Screen Mode**: Wall-mounted conference room screens require higher contrast, larger font steps, and periodic silent polling (30s interval) without interfering with active user editing.
4. **Sample Whiteboards**: Included built-in realistic whiteboard presets to allow instant verification of Gemini Vision extraction when physical whiteboard access or camera capture is inconvenient during evaluation.
