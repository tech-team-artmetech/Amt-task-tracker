import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  terminate,
  setLogLevel,
  collection,
  writeBatch,
  Firestore,
} from 'firebase/firestore';

let firebaseConfig: any = {};
try {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
} catch (e) {
  console.warn('[firestore-sync] Failed to read firebase-applet-config.json:', e);
}

// Silence verbose Firebase Firestore client stream logs in Node.js
try {
  setLogLevel('silent');
} catch {
  // Ignore
}

const quotaMarkerPath = path.resolve(process.cwd(), 'data', '.firestore_quota_exceeded');

let firestoreInstance: Firestore | null = null;
let isQuotaExceeded = false;
let quotaExceededAt = 0;
// Reset quota check every 24 hours (matching Google Cloud daily reset)
const QUOTA_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// On startup, check if quota was already exceeded within the last 24 hours
try {
  if (fs.existsSync(quotaMarkerPath)) {
    const raw = fs.readFileSync(quotaMarkerPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed?.exceededAt && Date.now() - parsed.exceededAt < QUOTA_COOLDOWN_MS) {
      isQuotaExceeded = true;
      quotaExceededAt = parsed.exceededAt;
      console.log('[Firestore Sync] Daily Firestore write quota was reached. Remote writes paused. Operating in local SQLite mode.');
    }
  }
} catch {
  // Ignore
}

export function isFirestoreQuotaExceeded(): boolean {
  if (isQuotaExceeded && Date.now() - quotaExceededAt > QUOTA_COOLDOWN_MS) {
    isQuotaExceeded = false;
    try {
      if (fs.existsSync(quotaMarkerPath)) fs.unlinkSync(quotaMarkerPath);
    } catch {
      // Ignore
    }
  }
  return isQuotaExceeded;
}

export function markFirestoreQuotaExceeded(reason?: string): void {
  isQuotaExceeded = true;
  quotaExceededAt = Date.now();
  console.warn(
    `[Firestore Sync] Daily Firestore write quota reached (${reason || 'RESOURCE_EXHAUSTED'}). Pausing cloud backup. Local SQLite database remains fully operational.`
  );

  try {
    const dir = path.dirname(quotaMarkerPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      quotaMarkerPath,
      JSON.stringify({ exceededAt: Date.now(), reason: reason || 'RESOURCE_EXHAUSTED' })
    );
  } catch {
    // Ignore
  }

  if (firestoreInstance) {
    terminate(firestoreInstance).catch(() => {});
    firestoreInstance = null;
  }
}

export function getFirestoreDb(): Firestore | null {
  if (isFirestoreQuotaExceeded()) {
    return null;
  }
  if (firestoreInstance) return firestoreInstance;
  try {
    const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    firestoreInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    return firestoreInstance;
  } catch (err: any) {
    console.warn('[Firestore Sync] Could not initialize Firestore:', err?.message || err);
    return null;
  }
}

export interface FirestoreBackupState {
  databaseBase64: string;
  updatedAt: string;
  size: number;
}

/**
 * Downloads the persisted SQLite database snapshot from Firestore.
 * Returns the binary Buffer if found, or null if no backup exists yet.
 */
let hasCheckedFirestore = false;
let didRestoreFromFirestore = false;

export function didRestoreFromCloud(): boolean {
  return didRestoreFromFirestore;
}

export async function restoreDatabaseFromFirestore(): Promise<Buffer | null> {
  try {
    const db = getFirestoreDb();
    if (!db) {
      console.warn('[Firestore Sync] Firestore DB instance not available for restore.');
      return null;
    }
    console.log('[Firestore Sync] Checking Firestore for persistent database snapshot...');
    
    // Allow up to 12 seconds for container cold-boot network handshake
    const fetchSnapshot = async () => {
      const getDocPromise = getDoc(doc(db, 'system', 'sqlite_state'));
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Firestore restore timeout (12s)')), 12000)
      );
      return (await Promise.race([getDocPromise, timeoutPromise])) as any;
    };

    let snapshotDoc: any = null;
    try {
      snapshotDoc = await fetchSnapshot();
    } catch (firstErr) {
      console.warn('[Firestore Sync] First restore attempt failed, retrying once...', firstErr);
      snapshotDoc = await fetchSnapshot();
    }

    hasCheckedFirestore = true;

    if (snapshotDoc && snapshotDoc.exists()) {
      const data = snapshotDoc.data() as FirestoreBackupState;
      if (data && data.databaseBase64) {
        // If local sqlite file exists on disk, check timestamps so local edits are not overwritten by a stale remote snapshot
        const localDbPath = path.resolve(process.cwd(), 'data', 'whiteboard.sqlite');
        if (fs.existsSync(localDbPath)) {
          const localMtime = fs.statSync(localDbPath).mtimeMs;
          const remoteTime = data.updatedAt ? new Date(data.updatedAt).getTime() : 0;
          if (localMtime > remoteTime + 1000) {
            console.log(`[Firestore Sync] Local sqlite database file is newer than remote snapshot (${new Date(localMtime).toISOString()} vs ${data.updatedAt}). Keeping local version.`);
            didRestoreFromFirestore = true;
            return null;
          }
        }

        const buffer = Buffer.from(data.databaseBase64, 'base64');
        didRestoreFromFirestore = true;
        console.log(`[Firestore Sync] Successfully restored database from Firestore (${buffer.length} bytes, updated at ${data.updatedAt})`);
        return buffer;
      }
    } else {
      console.log('[Firestore Sync] No previous database snapshot found in Firestore. Starting fresh.');
    }
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    console.warn('[Firestore Sync] Notice: Could not restore from Firestore snapshot (will proceed with local):', errMsg);
  }
  return null;
}

let saveTimeout: any = null;
let isSaving = false;
let pendingSaveBuffer: Uint8Array | null = null;

/**
 * Persists the current SQLite database snapshot to Firestore.
 * If immediate is true, it writes immediately; otherwise debounces 3 seconds.
 */
export async function flushFirestoreSave(dbBuffer?: Uint8Array): Promise<void> {
  const bufferToSave = dbBuffer || pendingSaveBuffer;
  if (!bufferToSave) return;
  pendingSaveBuffer = null;
  if (saveTimeout) clearTimeout(saveTimeout);

  if (isFirestoreQuotaExceeded()) {
    console.warn('[Firestore Sync] Quota exceeded, skipping remote snapshot write.');
    return;
  }

  isSaving = true;
  try {
    const db = getFirestoreDb();
    if (!db) {
      isSaving = false;
      return;
    }

    // Safety guard: if we did NOT restore from Firestore upon startup,
    // verify we don't accidentally overwrite an existing non-empty remote backup
    // with a smaller/blank newly seeded database
    if (!didRestoreFromFirestore && !hasCheckedFirestore) {
      try {
        const existing = await getDoc(doc(db, 'system', 'sqlite_state'));
        if (existing.exists()) {
          const remoteData = existing.data() as FirestoreBackupState;
          if (remoteData?.size && remoteData.size > bufferToSave.length + 5000) {
            console.warn(
              `[Firestore Sync] SAFEGUARD: Remote backup (${remoteData.size} bytes) is significantly larger than local fresh DB (${bufferToSave.length} bytes). Aborting overwrite to prevent data loss.`
            );
            isSaving = false;
            return;
          }
        }
      } catch {
        // Continue
      }
    }

    const base64 = Buffer.from(bufferToSave).toString('base64');
    const now = new Date().toISOString();
    
    // Save current snapshot
    await setDoc(
      doc(db, 'system', 'sqlite_state'),
      {
        databaseBase64: base64,
        updatedAt: now,
        size: bufferToSave.length,
      },
      { merge: true }
    );
    didRestoreFromFirestore = true;
    console.log(`[Firestore Sync] Cloud snapshot persisted to Firestore (${bufferToSave.length} bytes at ${now}).`);
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    const isQuota =
      err?.code === 'resource-exhausted' ||
      errMsg.includes('RESOURCE_EXHAUSTED') ||
      errMsg.includes('Quota exceeded') ||
      errMsg.includes('quota metric') ||
      errMsg.includes('quota limit');

    if (isQuota) {
      markFirestoreQuotaExceeded(errMsg);
      pendingSaveBuffer = null;
    } else {
      console.warn('[Firestore Sync] Notice: Cloud snapshot sync deferred:', errMsg);
    }
  } finally {
    isSaving = false;
  }
}

/**
 * Asynchronously persists the current SQLite database binary to Firestore.
 * Uses a debounce so multiple rapid transactions are batched smoothly.
 */
export function scheduleFirestoreSave(dbBuffer: Uint8Array, immediate = false): void {
  if (isFirestoreQuotaExceeded()) {
    return;
  }

  pendingSaveBuffer = dbBuffer;
  if (saveTimeout) clearTimeout(saveTimeout);

  if (immediate) {
    flushFirestoreSave(dbBuffer).catch((err) => {
      console.warn('[Firestore Sync] Immediate flush error:', err);
    });
    return;
  }

  saveTimeout = setTimeout(async () => {
    if (isSaving || !pendingSaveBuffer || isFirestoreQuotaExceeded()) return;
    await flushFirestoreSave();
  }, 2500);
}

/**
 * Synchronizes individual entity records to Firestore collections for direct querying / backup.
 */
export async function mirrorEntitiesToFirestore(data: {
  users?: any[];
  boardColumns?: any[];
  boardTasks?: any[];
  boardMeta?: any[];
  taskComments?: any[];
  managerAssignments?: any[];
}): Promise<void> {
  if (isFirestoreQuotaExceeded()) return;

  try {
    const db = getFirestoreDb();
    if (!db) return;
    const batch = writeBatch(db);
    let count = 0;

    if (data.users) {
      for (const u of data.users) {
        if (!u.id) continue;
        const ref = doc(db, 'users', String(u.id));
        batch.set(ref, {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          createdAt: u.createdAt || new Date().toISOString(),
        }, { merge: true });
        count++;
      }
    }

    if (data.boardMeta) {
      for (const m of data.boardMeta) {
        if (!m.boardDate) continue;
        const ref = doc(db, 'boards', String(m.boardDate));
        batch.set(ref, m, { merge: true });
        count++;
      }
    }

    if (data.boardColumns) {
      for (const c of data.boardColumns) {
        if (!c.id) continue;
        const ref = doc(db, 'columns', String(c.id));
        batch.set(ref, c, { merge: true });
        count++;
      }
    }

    if (data.boardTasks) {
      for (const t of data.boardTasks) {
        if (!t.id) continue;
        const ref = doc(db, 'tasks', String(t.id));
        batch.set(ref, t, { merge: true });
        count++;
      }
    }

    if (data.taskComments) {
      for (const c of data.taskComments) {
        if (!c.id) continue;
        const ref = doc(db, 'comments', String(c.id));
        batch.set(ref, c, { merge: true });
        count++;
      }
    }

    if (data.managerAssignments) {
      for (const a of data.managerAssignments) {
        if (!a.id) continue;
        const ref = doc(db, 'assignments', String(a.id));
        batch.set(ref, a, { merge: true });
        count++;
      }
    }

    if (count > 0) {
      await batch.commit();
      console.log(`[Firestore Sync] Mirrored ${count} entity documents into Firestore.`);
    }
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    if (errMsg.includes('RESOURCE_EXHAUSTED') || err?.code === 'resource-exhausted') {
      markFirestoreQuotaExceeded(errMsg);
    } else {
      console.warn('[Firestore Sync] Warning while mirroring entities to Firestore:', errMsg);
    }
  }
}
