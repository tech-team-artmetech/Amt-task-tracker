import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';
import { drizzle } from 'drizzle-orm/sql-js';
import * as schema from './schema.ts';
import { restoreDatabaseFromFirestore, scheduleFirestoreSave } from './firestore-sync.ts';

declare global {
  var _sqliteDbInstance: any;
  var _drizzleDbInstance: any;
  var _dbInitPromise: Promise<any> | undefined;
}

const dbFilePath = path.resolve(process.cwd(), 'data', 'whiteboard.sqlite');

export function saveDatabase(immediate = false): void {
  try {
    if (!global._sqliteDbInstance) return;
    const data = global._sqliteDbInstance.export();
    const dir = path.dirname(dbFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(dbFilePath, Buffer.from(data));
    // Persist to Google Cloud Firestore so data survives republishes & container restarts
    scheduleFirestoreSave(data, immediate);
  } catch (err) {
    console.error('[Database] Error persisting SQLite database to disk:', err);
  }
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

      // 1. Try to restore latest persistent snapshot from Firestore (survives republishes)
      const cloudBuffer = await restoreDatabaseFromFirestore();

      if (cloudBuffer && cloudBuffer.length > 0) {
        try {
          const dir = path.dirname(dbFilePath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(dbFilePath, cloudBuffer);
          sqliteDb = new SQL.Database(cloudBuffer);
          console.log(`[Database] Restored persistent database from Firestore (${cloudBuffer.length} bytes).`);
        } catch (err) {
          console.warn('[Database] Failed to initialize SQLite from Firestore buffer, falling back to local file:', err);
        }
      }

      // 2. If not from Firestore, try reading local file
      if (!sqliteDb && fs.existsSync(dbFilePath)) {
        try {
          const fileBuffer = fs.readFileSync(dbFilePath);
          sqliteDb = new SQL.Database(fileBuffer);
          console.log(`[Database] Loaded existing SQLite database from ${dbFilePath}`);
        } catch (err) {
          console.warn('[Database] Could not read existing sqlite file, creating fresh:', err);
          sqliteDb = new SQL.Database();
        }
      } else if (!sqliteDb) {
        const dir = path.dirname(dbFilePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        sqliteDb = new SQL.Database();
        console.log('[Database] Created fresh SQLite database.');
      }

      // Check for migrations (e.g. uid column in users table)
      try {
        const info = sqliteDb.exec("PRAGMA table_info(users)");
        if (info && info.length > 0 && info[0].values) {
          const cols = info[0].values.map((v: any[]) => v[1]);
          if (!cols.includes('uid')) {
            sqliteDb.run('ALTER TABLE users ADD COLUMN uid TEXT;');
            const data = sqliteDb.export();
            fs.writeFileSync(dbFilePath, Buffer.from(data));
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
