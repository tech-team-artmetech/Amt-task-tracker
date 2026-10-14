// One-time helper: downloads the latest database snapshot that the old Cloud Run / AI Studio
// deployment saved to Firestore, and writes it as a normal SQLite file you can upload to the new host.
//
//   node tools/export-firestore-snapshot.mjs [output-file]
//
// Default output: ./data/whiteboard.sqlite  (an existing file is kept as .bak first).
// Needs Node 18+ and no extra packages. It only READS from Firestore.
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const cfgPath = path.join(root, 'firebase-applet-config.json');
if (!fs.existsSync(cfgPath)) {
  console.error('firebase-applet-config.json not found. Run this from the project folder.');
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const out = path.resolve(process.argv[2] || path.join(root, 'data', 'whiteboard.sqlite'));

const url =
  `https://firestore.googleapis.com/v1/projects/${cfg.projectId}` +
  `/databases/${encodeURIComponent(cfg.firestoreDatabaseId || '(default)')}` +
  `/documents/system/sqlite_state?key=${encodeURIComponent(cfg.apiKey)}`;

const res = await fetch(url);
if (!res.ok) {
  console.error(`Firestore returned ${res.status}: ${(await res.text()).slice(0, 400)}`);
  console.error('If this says PERMISSION_DENIED, the Firestore rules were already locked down; unlock them temporarily or export from the Firebase console.');
  process.exit(1);
}
const doc = await res.json();
const b64 = doc?.fields?.databaseBase64?.stringValue;
const updatedAt = doc?.fields?.updatedAt?.stringValue;
if (!b64) {
  console.error('The snapshot document has no databaseBase64 field (a different snapshot format may be in use).');
  process.exit(1);
}
const bytes = Buffer.from(b64, 'base64');
if (bytes.length < 1024 || bytes.subarray(0, 15).toString('latin1') !== 'SQLite format 3') {
  console.error('Downloaded data does not look like a SQLite database; refusing to write it.');
  process.exit(1);
}

fs.mkdirSync(path.dirname(out), { recursive: true });
if (fs.existsSync(out)) {
  const bak = `${out}.bak-${Date.now()}`;
  fs.copyFileSync(out, bak);
  console.log(`Existing file backed up to ${bak}`);
}
fs.writeFileSync(out, bytes);
console.log(`Wrote ${bytes.length} bytes to ${out}`);
console.log(`Snapshot was last saved at: ${updatedAt || 'unknown'}`);
console.log('Check that this time is recent. Anything done after it is not in this file.');
