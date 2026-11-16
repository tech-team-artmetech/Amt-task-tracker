// One-time helper: empties the task board but keeps everyone's accounts.
//
//   npm run reset-tasks                 (uses DATA_DIR, or ./data)
//   node tools/reset-tasks.mjs [path/to/whiteboard.sqlite]
//
// STOP THE APP FIRST. The running app keeps the database in memory and would write the old
// tasks back on its next save. Start it again when this finishes.
//
// Removes: every task on every date, task comments, notifications, the "last published" marker.
// Keeps: accounts and passwords, roles, team columns and departments, manager assignments,
// push subscriptions.
// A full copy is saved first as backups/before-reset-<time>.sqlite next to the database.
import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';

const dataDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
const dbFile = path.resolve(process.argv[2] || path.join(dataDir, 'whiteboard.sqlite'));

if (!fs.existsSync(dbFile)) {
  console.error(`No database found at ${dbFile}. Set DATA_DIR or pass the file path.`);
  process.exit(1);
}

const original = fs.readFileSync(dbFile);
const backupDir = path.join(path.dirname(dbFile), 'backups');
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
const backupFile = path.join(backupDir, `before-reset-${stamp}.sqlite`);
fs.writeFileSync(backupFile, original);
console.log(`Backup saved: ${backupFile}`);

const SQL = await initSqlJs();
const db = new SQL.Database(original);
const tables = new Set(db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values.map((r) => r[0]) || []);
const count = (t) => (tables.has(t) ? db.exec(`SELECT count(*) FROM ${t}`)[0].values[0][0] : 0);

const before = {
  tasks: count('board_tasks'),
  comments: count('task_comments'),
  notifications: count('notifications'),
};

db.run('BEGIN');
for (const t of ['task_comments', 'board_tasks', 'notifications', 'board_meta']) {
  if (tables.has(t)) db.run(`DELETE FROM ${t}`);
}
db.run('COMMIT');

const tmp = `${dbFile}.tmp`;
fs.writeFileSync(tmp, Buffer.from(db.export()));
fs.renameSync(tmp, dbFile);

console.log(
  `Removed ${before.tasks} tasks, ${before.comments} comments and ${before.notifications} notifications.`
);
console.log(`Kept ${count('users')} accounts and ${count('board_columns')} team columns. Start the app again now.`);
