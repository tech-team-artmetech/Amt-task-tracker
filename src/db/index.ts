import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';
import { drizzle } from 'drizzle-orm/sql-js';
import * as schema from './schema.ts';

declare global {
  var _sqliteDbInstance: any;
  var _drizzleDbInstance: any;
  var _dbInitPromise: Promise<any> | undefined;
}

// The database lives in a single SQLite file on the host's persistent disk.
// Set DATA_DIR to put it outside the web root (recommended on shared hosting).
const dataDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
const dbFilePath = path.join(dataDir, 'whiteboard.sqlite');

let lastBackupDay = '';

function ensureDataDir(): void {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// Writes via a temp file + rename so a crash mid-write can never leave a truncated database.
function writeDatabaseFile(data: Uint8Array): void {
  ensureDataDir();
  const tmpPath = `${dbFilePath}.tmp`;
  fs.writeFileSync(tmpPath, Buffer.from(data));
  fs.renameSync(tmpPath, dbFilePath);
}

// Keeps one dated copy per day and prunes to the newest 14, as a cheap safety net.
function rotateDailyBackup(): void {
  try {
    const day = new Date().toISOString().slice(0, 10);
    if (day === lastBackupDay || !fs.existsSync(dbFilePath)) return;
    const backupDir = path.join(dataDir, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(dbFilePath, path.join(backupDir, `whiteboard-${day}.sqlite`));
    lastBackupDay = day;
    const files = fs.readdirSync(backupDir).filter((f) => f.startsWith('whiteboard-')).sort();
    for (const old of files.slice(0, Math.max(0, files.length - 14))) {
      fs.unlinkSync(path.join(backupDir, old));
    }
  } catch (err) {
    console.warn('[Database] Daily backup skipped:', err);
  }
}

// `immediate` is kept for call-site compatibility: every save is written to disk synchronously.
export function saveDatabase(_immediate = false): void {
  try {
    if (!global._sqliteDbInstance) return;
    const data = global._sqliteDbInstance.export();
    writeDatabaseFile(data);
    rotateDailyBackup();
  } catch (err) {
    console.error('[Database] Error persisting SQLite database to disk:', err);
  }
}

// Final flush used on shutdown signals.
export function flushDatabaseSync(): void {
  saveDatabase(true);
}

export async function ensureDbReady(): Promise<any> {
  if (global._drizzleDbInstance) {
    return global._drizzleDbInstance;
  }
  if (global._dbInitPromise) {
    return global._dbInitPromise;
  }

  global._dbInitPromise = (async () => {
    try {
      const SQL = await initSqlJs();
      let sqliteDb: any;

      if (fs.existsSync(dbFilePath)) {
        // Never fall back to an empty database if an existing file can't be read:
        // that would silently start fresh and overwrite real data on the next save.
        const fileBuffer = fs.readFileSync(dbFilePath);
        sqliteDb = new SQL.Database(fileBuffer);
        console.log(`[Database] Loaded existing SQLite database from ${dbFilePath} (${fileBuffer.length} bytes)`);
      } else {
        ensureDataDir();
        sqliteDb = new SQL.Database();
        console.log(`[Database] Created fresh SQLite database at ${dbFilePath}`);
      }

      // Check for migrations (e.g. uid column in users table)
      try {
        const info = sqliteDb.exec("PRAGMA table_info(users)");
        if (info && info.length > 0 && info[0].values) {
          const cols = info[0].values.map((v: any[]) => v[1]);
          if (!cols.includes('uid')) {
            sqliteDb.run('ALTER TABLE users ADD COLUMN uid TEXT;');
            writeDatabaseFile(sqliteDb.export());
            console.log('[Database] Added missing uid column to users table.');
          }
        }
      } catch {
        // Table may not exist yet, will be created in initDatabase
      }

      global._sqliteDbInstance = sqliteDb;
      global._drizzleDbInstance = drizzle(sqliteDb, { schema });
      return global._drizzleDbInstance;
    } catch (err) {
      global._dbInitPromise = undefined;
      console.error('[Database] Failed to initialize SQLite database:', err);
      throw err;
    }
  })();

  return global._dbInitPromise;
}

// Proxy for drizzle db instance that supports transparent auto-save on writes
export const db: any = new Proxy({} as any, {
  get(_target, prop) {
    if (prop === 'execute' || prop === 'run') {
      return async (statement: any) => {
        const instance = await ensureDbReady();
        const res = await instance.run(statement);
        saveDatabase();
        return res;
      };
    }
    if (prop === 'transaction') {
      return async (callback: any) => {
        const instance = await ensureDbReady();
        const res = await instance.transaction(callback);
        saveDatabase();
        return res;
      };
    }
    if (prop === 'then') {
      return undefined;
    }
    return (...args: any[]) => {
      if (!global._drizzleDbInstance) {
        throw new Error('Database not initialized. Please call ensureDbReady() or ensureDatabaseReady() first.');
      }
      const targetFn = (global._drizzleDbInstance as any)[prop];
      if (typeof targetFn === 'function') {
        const query = targetFn.apply(global._drizzleDbInstance, args);
        if (typeof prop === 'string' && ['insert', 'update', 'delete'].includes(prop)) {
          if (query && typeof query.then === 'function') {
            const origThen = query.then.bind(query);
            query.then = (onFulfilled?: any, onRejected?: any) => {
              return origThen((result: any) => {
                saveDatabase();
                return onFulfilled ? onFulfilled(result) : result;
              }, onRejected);
            };
          }
        }
        return query;
      }
      return targetFn;
    };
  },
});
