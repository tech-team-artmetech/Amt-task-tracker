import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { eq, sql, desc, asc, and, or, inArray } from 'drizzle-orm';
import { db, ensureDbReady, saveDatabase } from '../src/db/index.ts';
import {
  users,
  boardMeta,
  boardColumns,
  boardTasks,
  taskComments,
  managerAssignments,
  notifications,
  columnDateExclusions,
  appRoles,
} from '../src/db/schema.ts';
import type { User, BoardColumn, BoardTask, BoardData, Role, TaskComment, ManagerOption, ManagerAssignment, AppRole } from './types.ts';
import { matchToRegisteredTeamMember } from './gemini.ts';
import {
  notifyEmployeeTaskAssigned,
  notifyAdminAndManagersTaskCompleted,
  notifyTaskCompleted,
  createNotification,
  findUserByEmployeeName,
  broadcastBoardUpdate,
} from './notifications.ts';
import { extractTaskQuantity } from '../src/lib/quantity.ts';

export interface SeedAccount {
  name: string;
  email: string;
  password: string;
  role: Role;
}

export const SEED_ACCOUNTS: SeedAccount[] = [
  // Admin accounts
  {
    name: 'Soham',
    email: 'soham@artmetech.in',
    password: 'Soham#Artm92$Adm',
    role: 'admin',
  },
  {
    name: 'Admin Team',
    email: 'tech.team@artmetech.in',
    password: 'TechTeam#841*Core',
    role: 'admin',
  },

  // Manager accounts
  {
    name: 'Varsha',
    email: 'varsha@artmetech.in',
    password: 'Varsha%Mgr512!V',
    role: 'manager',
  },
  {
    name: 'Chinmay',
    email: 'chinmay@artmetech.in',
    password: 'Chinmay*Lead84#C',
    role: 'manager',
  },
  {
    name: 'Swara',
    email: 'swara@artmetech.in',
    password: 'Swara$Ops629@S',
    role: 'manager',
  },
  {
    name: 'Suhani',
    email: 'suhani@artmetech.in',
    password: 'Suhani#Flow317!S',
    role: 'manager',
  },
  {
    name: 'Jasmine',
    email: 'jasmine@artmetech.in',
    password: 'Jasmine^Sync408#J',
    role: 'manager',
  },
  {
    name: 'Jinal',
    email: 'jinal@artmetech.in',
    password: 'Jinal!Plan925*J',
    role: 'manager',
  },
  {
    name: 'Anjan',
    email: 'anjan@artmetech.in',
    password: 'Anjan@Track763$A',
    role: 'manager',
  },
  {
    name: 'Harsh thakkar',
    email: 'harsh@artmetech.in',
    password: 'Harsh#Mgr782!H',
    role: 'manager',
  },
  {
    name: 'Aanchal',
    email: 'aanchal@artmetech.in',
    password: 'Aanchal$Mgr439!A',
    role: 'manager',
  },

  // Team Member accounts
  {
    name: 'Ujwal',
    email: 'ujwal@artmetech.in',
    password: 'Ujwal#Edit284!U',
    role: 'Editors',
  },
  {
    name: 'Aamir',
    email: 'aamir@artmetech.in',
    password: 'Aamir*Edit591@A',
    role: 'Editors',
  },
  {
    name: 'Om',
    email: 'om@artmetech.in',
    password: 'Om!Clip837#O',
    role: 'Editors',
  },
  {
    name: 'Hardik',
    email: 'hardik@artmetech.in',
    password: 'Hardik$Reel462^H',
    role: 'Editors',
  },
  {
    name: 'Pooja',
    email: 'pooja@artmetech.in',
    password: 'Pooja^Timeline719!P',
    role: 'Editors',
  },
  {
    name: 'Shrushti',
    email: 'shrushti@artmetech.in',
    password: 'Shrushti*Frame358@S',
    role: 'Editors',
  },
  {
    name: 'Jay',
    email: 'jay@artmetech.in',
    password: 'Jay@Design642!J',
    role: 'Designers',
  },
  {
    name: 'Pradeep',
    email: 'pradeep@artmetech.in',
    password: 'Pradeep#Vector815$P',
    role: 'Designers',
  },
  {
    name: 'Ashish',
    email: 'ashish@artmetech.in',
    password: 'Ashish*Pixel293^A',
    role: 'Designers',
  },
  {
    name: 'Tanmay',
    email: 'tanmay@artmetech.in',
    password: 'Tanmay!Craft471*T',
    role: 'Designers',
  },
  {
    name: 'Mehul',
    email: 'mehul@artmetech.in',
    password: 'Mehul$Lens938#M',
    role: 'Cinematographers',
  },
];

export function getRelativeDateString(offsetDays: number, baseDate?: Date): string {
  const d = baseDate ? new Date(baseDate) : new Date();
  d.setDate(d.getDate() - offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getDayLabel(dateStr: string): { label: string; dayOfWeek: string } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const todayStr = getRelativeDateString(0);
  const yesterdayStr = getRelativeDateString(1);
  const tomorrowStr = getRelativeDateString(-1);

  const dayOfWeek = days[dt.getDay()];
  const monthName = months[dt.getMonth()];
  const formatted = `${monthName} ${d}`;

  if (dateStr === todayStr) {
    return { label: `Today (${formatted})`, dayOfWeek };
  }
  if (dateStr === yesterdayStr) {
    return { label: `Yesterday (${formatted})`, dayOfWeek };
  }
  if (dateStr === tomorrowStr) {
    return { label: `Tomorrow (${formatted})`, dayOfWeek };
  }
  return { label: `${formatted} (${dayOfWeek})`, dayOfWeek };
}

let initPromise: Promise<void> | null = null;
let isInitialized = false;

export async function ensureDatabaseReady(): Promise<void> {
  if (isInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      console.log('[Database] Ensuring SQLite database schema and seeds...');
      await ensureDbReady();
      isInitialized = true;
      await initDatabase();
      console.log('[Database] SQLite database schema and initial seeds ready.');
    } catch (err: any) {
      isInitialized = false;
      initPromise = null;
      console.error('[Database] Database initialization error:', err?.message || err);
      throw err;
    }
  })();

  return initPromise;
}

export async function initDatabase(): Promise<void> {
  console.log('[Database] Initializing SQLite database tables and seed records...');
  await ensureDbReady();

  // 1. Ensure all tables are created if not already present
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY,
      uid text UNIQUE,
      name text NOT NULL,
      email text NOT NULL UNIQUE,
      password_hash text,
      role text NOT NULL DEFAULT 'Editors',
      active integer NOT NULL DEFAULT 1,
      push_notifications_enabled integer DEFAULT 0,
      created_at text NOT NULL
    );
  `);

  try {
    await db.execute(sql`ALTER TABLE users ADD COLUMN uid text;`);
  } catch {
    // Column already exists
  }

  try {
    await db.execute(sql`ALTER TABLE users ADD COLUMN push_notifications_enabled integer DEFAULT 0;`);
  } catch {
    // Column already exists
  }

  try {
    await db.execute(sql`ALTER TABLE board_columns ADD COLUMN department text DEFAULT 'General';`);
  } catch {
    // Column already exists
  }

  try {
    await db.execute(sql`ALTER TABLE board_columns ADD COLUMN deleted_from_date text;`);
  } catch {
    // Column already exists
  }

  try {
    await db.execute(sql`ALTER TABLE board_tasks ADD COLUMN total_quantity integer DEFAULT 1;`);
  } catch {
    // Column already exists
  }

  try {
    await db.execute(sql`ALTER TABLE board_tasks ADD COLUMN completed_quantity integer DEFAULT 0;`);
  } catch {
    // Column already exists
  }

  try {
    await db.execute(sql`ALTER TABLE board_tasks ADD COLUMN admin_approved integer DEFAULT 0;`);
  } catch {
    // Column already exists
  }

  try {
    await db.execute(sql`ALTER TABLE board_tasks ADD COLUMN admin_approved_by text;`);
  } catch {
    // Column already exists
  }

  try {
    await db.execute(sql`ALTER TABLE board_tasks ADD COLUMN admin_approved_at text;`);
  } catch {
    // Column already exists
  }

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS board_meta (
      id integer PRIMARY KEY,
      updated_at text NOT NULL,
      published_by text NOT NULL
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS board_columns (
      id text PRIMARY KEY,
      employee_name text NOT NULL,
      department text DEFAULT 'General',
      sort_order integer NOT NULL,
      manager_id text,
      manager_name text,
      deleted_from_date text
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      endpoint text NOT NULL UNIQUE,
      subscription_json text NOT NULL,
      created_at text NOT NULL
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS column_date_exclusions (
      id text PRIMARY KEY,
      column_id text NOT NULL,
      excluded_date text NOT NULL
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS board_tasks (
      id text PRIMARY KEY,
      column_id text NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
      text text NOT NULL,
      sort_order integer NOT NULL,
      completed integer DEFAULT 0,
      completed_by text,
      completed_at text,
      assigned_date text,
      total_quantity integer DEFAULT 1,
      completed_quantity integer DEFAULT 0,
      admin_approved integer DEFAULT 0,
      admin_approved_by text,
      admin_approved_at text
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS task_comments (
      id text PRIMARY KEY,
      task_id text NOT NULL REFERENCES board_tasks(id) ON DELETE CASCADE,
      user_id text NOT NULL,
      user_name text NOT NULL,
      user_role text NOT NULL,
      content text NOT NULL,
      created_at text NOT NULL
    );
  `);

  // Ensure task_comments does not have an obsolete restrictive CHECK constraint on user_role
  try {
    if (global._sqliteDbInstance) {
      const res = global._sqliteDbInstance.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='task_comments'");
      const tableSql = res?.[0]?.values?.[0]?.[0] || '';
      if (typeof tableSql === 'string' && tableSql.includes('CHECK(user_role IN')) {
        console.log('[Database] Migrating task_comments table to support all roles (admin, manager, editors, etc.)...');
        global._sqliteDbInstance.run(`
          CREATE TABLE IF NOT EXISTS task_comments_migrated (
            id text PRIMARY KEY,
            task_id text NOT NULL REFERENCES board_tasks(id) ON DELETE CASCADE,
            user_id text NOT NULL,
            user_name text NOT NULL,
            user_role text NOT NULL,
            content text NOT NULL,
            created_at text NOT NULL
          );
        `);
        global._sqliteDbInstance.run(`
          INSERT INTO task_comments_migrated (id, task_id, user_id, user_name, user_role, content, created_at)
          SELECT id, task_id, user_id, user_name, user_role, content, created_at FROM task_comments;
        `);
        global._sqliteDbInstance.run(`DROP TABLE task_comments;`);
        global._sqliteDbInstance.run(`ALTER TABLE task_comments_migrated RENAME TO task_comments;`);
        saveDatabase(true);
        console.log('[Database] task_comments successfully migrated!');
      }
    }
  } catch (err: any) {
    console.warn('[Database] task_comments migration check notice:', err?.message || err);
  }

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS manager_assignments (
      id text PRIMARY KEY,
      manager_id text NOT NULL,
      manager_name text NOT NULL,
      employee_name text NOT NULL,
      created_at text NOT NULL
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      user_email text,
      type text NOT NULL,
      title text NOT NULL,
      message text NOT NULL,
      task_id text,
      task_text text,
      employee_name text,
      actor_name text,
      is_read integer NOT NULL DEFAULT 0,
      created_at text NOT NULL
    );
  `);

  try {
    await db.execute(sql`
      UPDATE notifications 
      SET 
        title = COALESCE(employee_name, 'Employee') || ' completed a task',
        message = COALESCE(employee_name, 'Employee') || ' finished - ' || COALESCE(task_text, 'Task')
      WHERE type = 'task_completed';
    `);
  } catch {
    // table or rows already up to date
  }

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS app_roles (
      id text PRIMARY KEY,
      name text NOT NULL UNIQUE,
      description text,
      is_system integer DEFAULT 0,
      created_at text NOT NULL
    );
  `);

  // Seed default roles into app_roles if not already present
  try {
    const defaultRoles = [
      { name: 'admin', description: 'System Administrator (Full access & vision upload)', isSystem: 1 },
      { name: 'manager', description: 'Team Manager (Reorder priorities & manage assigned members)', isSystem: 1 },
      { name: 'Editors', description: 'Video & Audio Editors', isSystem: 0 },
      { name: 'Designers', description: 'Graphic & UI Designers', isSystem: 0 },
      { name: 'Cinematographers', description: 'Camera & Studio Cinematographers', isSystem: 0 },
      { name: 'employee', description: 'General Team Member (View personal column)', isSystem: 1 },
    ];
    for (const defRole of defaultRoles) {
      const exists = await db
        .select({ id: appRoles.id })
        .from(appRoles)
        .where(sql`LOWER(${appRoles.name}) = ${defRole.name.toLowerCase()}`)
        .limit(1);
      if (exists.length === 0) {
        await db.insert(appRoles).values({
          id: crypto.randomUUID(),
          name: defRole.name,
          description: defRole.description,
          isSystem: defRole.isSystem,
          createdAt: new Date().toISOString(),
        });
      }
    }
  } catch (rolesErr) {
    console.warn('[Database] Seed roles warning:', rolesErr);
  }

  // Permanently purge blocked members (Shreay, aa) from the entire database
  try {
    const blockedNames = ['shreay', 'aa'];
    for (const bName of blockedNames) {
      const colsToPurge = await db
        .select({ id: boardColumns.id })
        .from(boardColumns)
        .where(sql`LOWER(TRIM(${boardColumns.employeeName})) = ${bName}`);
      const colIds = colsToPurge.map((c: any) => c.id);
      if (colIds.length > 0) {
        for (const cId of colIds) {
          const tRows = await db.select({ id: boardTasks.id }).from(boardTasks).where(eq(boardTasks.columnId, cId));
          const tIds = tRows.map((t: any) => t.id);
          if (tIds.length > 0) {
            await db.delete(taskComments).where(inArray(taskComments.taskId, tIds));
            await db.delete(boardTasks).where(inArray(boardTasks.id, tIds));
          }
          await db.delete(boardColumns).where(eq(boardColumns.id, cId));
        }
      }
      await db.delete(managerAssignments).where(sql`LOWER(TRIM(${managerAssignments.employeeName})) = ${bName}`);
      await db.delete(users).where(sql`LOWER(TRIM(${users.name})) = ${bName} OR LOWER(TRIM(${users.email})) LIKE ${bName + '@%'}`);
      await db.delete(notifications).where(
        sql`LOWER(TRIM(COALESCE(${notifications.employeeName}, ''))) = ${bName} OR LOWER(${notifications.title}) LIKE ${'%' + bName + '%'} OR LOWER(${notifications.message}) LIKE ${'%' + bName + '%'}`
      );
    }
    // Wipe all historical notifications on database init so old notifications from earlier do not appear on login
    await db.delete(notifications);
    console.log('[Database] Cleared historical notifications and purged blocked team members.');
  } catch (purgeErr) {
    console.warn('[Database] Purge blocked members warning:', purgeErr);
  }

  console.log('[Database] Tables verified and ready.');

  await seedAccounts();
}

export async function cleanupMockData(): Promise<void> {
  await ensureDbReady();
  const mockEmployeeNames = [
    'Elena Employee',
    'David Developer',
    'Sarah Designer',
    'Morgan Manager',
    'Alex Admin',
  ];

  const mockEmails = [
    'admin@office.local',
    'manager@office.local',
    'employee@office.local',
    'admin@artmetech.in',
    'manager@artmetech.in',
    'employee@artmetech.in',
  ];

  await db.transaction(async (tx: any) => {
    // 1. Delete mock columns and their tasks
    const mockCols = await tx
      .select({ id: boardColumns.id })
      .from(boardColumns)
      .where(inArray(boardColumns.employeeName, mockEmployeeNames));

    const mockColIds = mockCols.map((c: any) => c.id);

    if (mockColIds.length > 0) {
      const tasksInCols = await tx
        .select({ id: boardTasks.id })
        .from(boardTasks)
        .where(inArray(boardTasks.columnId, mockColIds));

      const taskIds = tasksInCols.map((t: any) => t.id);
      if (taskIds.length > 0) {
        await tx.delete(taskComments).where(inArray(taskComments.taskId, taskIds));
        await tx.delete(boardTasks).where(inArray(boardTasks.id, taskIds));
      }
      await tx.delete(boardColumns).where(inArray(boardColumns.id, mockColIds));
    }

    // Also delete any remaining mock tasks with sample text
    await tx.delete(boardTasks).where(
      sql`${boardTasks.text} LIKE '%Cloud SQL%' OR ${boardTasks.text} LIKE '%sprint ticket%' OR ${boardTasks.text} LIKE '%Figma%' OR ${boardTasks.text} LIKE '%PR #%' OR ${boardTasks.text} LIKE '%Gemini 3.1%' OR ${boardTasks.text} LIKE '%Wall Display%'`
    );

    // 2. Delete mock manager assignments
    await tx.delete(managerAssignments).where(
      sql`employee_name IN ('Elena Employee', 'David Developer', 'Sarah Designer', 'Morgan Manager', 'Alex Admin') OR manager_name IN ('Morgan Manager', 'Alex Admin')`
    );

    // 3. Delete mock users
    for (const email of mockEmails) {
      await tx.delete(users).where(sql`LOWER(${users.email}) = ${email.toLowerCase()}`);
    }
    await tx.delete(users).where(
      inArray(users.name, ['Alex Admin', 'Morgan Manager', 'Elena Employee', 'David Developer', 'Sarah Designer'])
    );

    // 4. If all remaining board columns are 0, clean up meta
    const remainingCols = await tx.select({ count: sql<number>`count(*)` }).from(boardColumns);
    if (Number(remainingCols[0]?.count || 0) === 0) {
      await tx.delete(boardMeta);
      await tx.delete(boardTasks);
      await tx.delete(taskComments);
    }
  });

  console.log('[Database] Cleaned up mock employee and task data.');
}

export async function updateUserPassword(userId: string, newPlainPassword: string): Promise<void> {
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(newPlainPassword, salt);
  await db
    .update(users)
    .set({ passwordHash: hash })
    .where(eq(users.id, userId));
}

async function seedAccounts(): Promise<void> {
  for (const account of SEED_ACCOUNTS) {
    const cleanEmail = account.email.trim().toLowerCase();
    const existing = await db
      .select()
      .from(users)
      .where(sql`LOWER(${users.email}) = ${cleanEmail}`)
      .limit(1);

    if (existing.length === 0) {
      const id = crypto.randomUUID();
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(account.password, salt);
      const now = new Date().toISOString();

      await db.insert(users).values({
        id,
        name: account.name,
        email: cleanEmail,
        passwordHash: hash,
        role: account.role,
        active: 1,
        createdAt: now,
      });
    } else {
      // User already exists in database.
      // NEVER overwrite custom password, role, or active status configured by admin!
      const user = existing[0];
      if (!user.passwordHash) {
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(account.password, salt);
        await db.update(users).set({ passwordHash: hash }).where(eq(users.id, user.id));
      }
    }
  }

  // Passwords are intentionally never written to logs.
  console.log(`[Database] Seed accounts verified (${SEED_ACCOUNTS.length} accounts).`);

  await syncTeamColumns();
}

async function syncTeamColumns(): Promise<void> {
  const allUsers = await db.select().from(users);
  const existingCols = await db.select().from(boardColumns);

  const BLOCKED = new Set(['shreay', 'aa']);

  let maxSortOrder = existingCols.reduce((max: number, c: any) => Math.max(max, c.sortOrder ?? 0), 0);

  for (const u of allUsers) {
    const cleanLowerName = u.name.toLowerCase().trim();
    if (BLOCKED.has(cleanLowerName)) continue;

    // Any team member with a non-admin role gets a column synced with their department
    if (u.role && u.role.toLowerCase() !== 'admin') {
      const colName = u.name;
      const dept = u.role === 'manager' ? 'Managers' : u.role.trim();
      
      const foundCol = existingCols.find((c: any) => c.employeeName.toLowerCase().trim() === cleanLowerName);
      if (foundCol) {
        await db
          .update(boardColumns)
          .set({ 
            department: dept,
            deletedFromDate: null,
          })
          .where(eq(boardColumns.id, foundCol.id));
      } else {
        maxSortOrder++;
        const newColId = crypto.randomUUID();
        await db.insert(boardColumns).values({
          id: newColId,
          employeeName: colName,
          department: dept,
          sortOrder: maxSortOrder,
          deletedFromDate: null,
        });
      }
    }
  }
}

export async function getUserByEmail(email: string): Promise<(User & { passwordHash: string }) | null> {
  await ensureDatabaseReady();
  const cleanEmail = email.trim().toLowerCase();
  const rows = await db
    .select()
    .from(users)
    .where(sql`LOWER(${users.email}) = ${cleanEmail}`)
    .limit(1);

  if (rows.length > 0) {
    const r = rows[0];
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role as Role,
      active: Boolean(r.active),
      passwordHash: r.passwordHash || '',
      pushEnabled: Boolean(r.pushNotificationsEnabled),
    };
  }
  return null;
}

export async function getUserById(id: string): Promise<User | null> {
  await ensureDatabaseReady();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (rows.length > 0) {
    const r = rows[0];
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role as Role,
      active: Boolean(r.active),
      pushEnabled: Boolean(r.pushNotificationsEnabled),
    };
  }
  return null;
}

export async function updateUserPushPreference(userId: string, enabled: boolean): Promise<void> {
  await ensureDatabaseReady();
  await db
    .update(users)
    .set({ pushNotificationsEnabled: enabled ? 1 : 0 })
    .where(eq(users.id, userId));
}

export async function validateUserLogin(
  identifier: string,
  plainPassword: string
): Promise<{ user: User | null; error?: string }> {
  await ensureDatabaseReady();
  const cleanId = (identifier || '').trim().toLowerCase();
  const cleanPass = (plainPassword || '').trim();

  if (!cleanId || !cleanPass) {
    return { user: null, error: 'Incorrect login Id or password' };
  }

  // 1. Exact match on email (case-insensitive)
  let found = await getUserByEmail(cleanId);

  // 2. Exact match on user name (case-insensitive)
  if (!found) {
    const byName = await db
      .select()
      .from(users)
      .where(sql`LOWER(TRIM(${users.name})) = ${cleanId}`)
      .limit(1);

    if (byName.length > 0) {
      const r = byName[0];
      found = {
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role as Role,
        active: Boolean(r.active),
        passwordHash: r.passwordHash || '',
        pushEnabled: Boolean(r.pushNotificationsEnabled),
      };
    }
  }

  // 3. Match on email username prefix (e.g. "pooja" for "pooja@artmetech.in")
  if (!found) {
    const byPrefix = await db
      .select()
      .from(users)
      .where(sql`LOWER(SUBSTR(${users.email}, 1, INSTR(${users.email}, '@') - 1)) = ${cleanId}`)
      .limit(1);

    if (byPrefix.length > 0) {
      const r = byPrefix[0];
      found = {
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role as Role,
        active: Boolean(r.active),
        passwordHash: r.passwordHash || '',
        pushEnabled: Boolean(r.pushNotificationsEnabled),
      };
    }
  }

  // 4. Match ignoring spaces (e.g. "sohamthakkar" for "Soham Thakkar")
  if (!found) {
    const cleanIdNoSpace = cleanId.replace(/\s+/g, '');
    const allUsers = await db.select().from(users);
    const matched = allUsers.find(
      (u: any) =>
        (u.name || '').toLowerCase().replace(/\s+/g, '') === cleanIdNoSpace ||
        (u.email || '').toLowerCase().replace(/\s+/g, '') === cleanIdNoSpace
    );
    if (matched) {
      found = {
        id: matched.id,
        name: matched.name,
        email: matched.email,
        role: matched.role as Role,
        active: Boolean(matched.active),
        passwordHash: matched.passwordHash || '',
        pushEnabled: Boolean(matched.pushNotificationsEnabled),
      };
    }
  }

  // 5. Fallback LIKE match across active users if not found yet
  if (!found) {
    const fallbackRows = await db
      .select()
      .from(users)
      .where(sql`LOWER(${users.email}) LIKE ${`%${cleanId}%`} OR LOWER(${users.name}) LIKE ${`%${cleanId}%`}`)
      .limit(1);

    if (fallbackRows.length > 0) {
      const r = fallbackRows[0];
      found = {
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role as Role,
        active: Boolean(r.active),
        passwordHash: r.passwordHash || '',
        pushEnabled: Boolean(r.pushNotificationsEnabled),
      };
    }
  }

  if (!found || !found.active) {
    return {
      user: null,
      error: 'Incorrect login Id or password',
    };
  }

  let isPasswordValid = false;
  try {
    isPasswordValid =
      bcrypt.compareSync(cleanPass, found.passwordHash) ||
      bcrypt.compareSync(plainPassword, found.passwordHash);
  } catch {
    isPasswordValid = false;
  }

  // Note: the original seed password is NOT accepted as a fallback. Once an admin changes a
  // password, only the stored (hashed) password works.
  if (!isPasswordValid) {
    return {
      user: null,
      error: 'Incorrect login Id or password',
    };
  }

  return {
    user: {
      id: found.id,
      name: found.name,
      email: found.email,
      role: found.role,
      active: found.active,
      pushEnabled: Boolean(found.pushEnabled),
    },
  };
}

export async function getManagers(): Promise<ManagerOption[]> {
  await ensureDatabaseReady();
  const managerUsers = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.role, 'manager'))
    .orderBy(asc(users.name));

  const result: ManagerOption[] = [];
  for (const mgr of managerUsers) {
    const colCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(boardColumns)
      .where(eq(boardColumns.managerId, mgr.id));

    result.push({
      id: mgr.id,
      name: mgr.name,
      email: mgr.email,
      assignedCount: Number(colCount[0]?.count || 0),
    });
  }
  return result;
}

export async function getManagerAssignments(): Promise<ManagerAssignment[]> {
  await ensureDatabaseReady();
  const rows = await db
    .select()
    .from(managerAssignments)
    .orderBy(asc(managerAssignments.employeeName));

  return rows.map((r: any) => ({
    id: r.id,
    managerId: r.managerId,
    managerName: r.managerName,
    employeeName: r.employeeName,
    createdAt: r.createdAt,
  }));
}

export async function assignEmployeeToManager(
  employeeName: string,
  managerId: string | null,
  columnId?: string
): Promise<void> {
  await ensureDatabaseReady();
  const cleanEmpName = employeeName.trim();

  await db.transaction(async (tx: any) => {
    if (!managerId) {
      await tx
        .delete(managerAssignments)
        .where(sql`LOWER(${managerAssignments.employeeName}) = ${cleanEmpName.toLowerCase()}`);

      if (columnId) {
        await tx
          .update(boardColumns)
          .set({ managerId: null, managerName: null })
          .where(eq(boardColumns.id, columnId));
      } else {
        await tx
          .update(boardColumns)
          .set({ managerId: null, managerName: null })
          .where(sql`LOWER(${boardColumns.employeeName}) = ${cleanEmpName.toLowerCase()}`);
      }
    } else {
      const mgrRows = await tx
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(eq(users.id, managerId), eq(users.role, 'manager')))
        .limit(1);

      if (mgrRows.length === 0) {
        throw new Error('Manager not found.');
      }
      const mgr = mgrRows[0];

      await tx
        .delete(managerAssignments)
        .where(sql`LOWER(${managerAssignments.employeeName}) = ${cleanEmpName.toLowerCase()}`);

      await tx.insert(managerAssignments).values({
        id: crypto.randomUUID(),
        managerId: mgr.id,
        managerName: mgr.name,
        employeeName: cleanEmpName,
        createdAt: new Date().toISOString(),
      });

      if (columnId) {
        await tx
          .update(boardColumns)
          .set({ managerId: mgr.id, managerName: mgr.name })
          .where(eq(boardColumns.id, columnId));
      } else {
        await tx
          .update(boardColumns)
          .set({ managerId: mgr.id, managerName: mgr.name })
          .where(sql`LOWER(${boardColumns.employeeName}) = ${cleanEmpName.toLowerCase()}`);
      }
    }
  });
  broadcastBoardUpdate();
}

export async function bulkAssignEmployees(
  assignments: Array<{ employeeName: string; managerId?: string | null; managerIds?: string[] }>
): Promise<void> {
  await ensureDatabaseReady();
  await db.transaction(async (tx: any) => {
    for (const item of assignments) {
      const cleanEmpName = (item.employeeName || '').trim();
      if (!cleanEmpName) continue;

      let mgrIds: string[] = [];
      if (Array.isArray(item.managerIds)) {
        mgrIds = item.managerIds.filter(Boolean);
      } else if (item.managerId) {
        mgrIds = [item.managerId];
      }

      await tx
        .delete(managerAssignments)
        .where(sql`LOWER(TRIM(${managerAssignments.employeeName})) = ${cleanEmpName.toLowerCase()}`);

      if (mgrIds.length > 0) {
        const mgrRows = await tx
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(and(inArray(users.id, mgrIds), eq(users.role, 'manager')));

        for (const mgr of mgrRows) {
          await tx.insert(managerAssignments).values({
            id: crypto.randomUUID(),
            managerId: mgr.id,
            managerName: mgr.name,
            employeeName: cleanEmpName,
            createdAt: new Date().toISOString(),
          });
        }

        const primaryMgr = mgrRows[0] || null;
        const primaryMgrName = mgrRows.map((m: any) => m.name).join(', ');

        const existingCols = await tx
          .select({ id: boardColumns.id })
          .from(boardColumns)
          .where(sql`LOWER(TRIM(${boardColumns.employeeName})) = ${cleanEmpName.toLowerCase()}`)
          .limit(1);

        if (existingCols.length > 0) {
          await tx
            .update(boardColumns)
            .set({ 
              managerId: primaryMgr?.id || null, 
              managerName: primaryMgrName || null,
              deletedFromDate: null,
            })
            .where(eq(boardColumns.id, existingCols[0].id));
        } else {
          const uRow = await tx
            .select({ role: users.role })
            .from(users)
            .where(sql`LOWER(TRIM(${users.name})) = ${cleanEmpName.toLowerCase()}`)
            .limit(1);
          const dept = uRow[0]?.role === 'manager' ? 'Managers' : (uRow[0]?.role || 'General');
          await tx.insert(boardColumns).values({
            id: crypto.randomUUID(),
            employeeName: cleanEmpName,
            department: dept,
            managerId: primaryMgr?.id || null,
            managerName: primaryMgrName || null,
            sortOrder: 999,
            deletedFromDate: null,
          });
        }
      } else {
        await tx
          .update(boardColumns)
          .set({ managerId: null, managerName: null })
          .where(sql`LOWER(TRIM(${boardColumns.employeeName})) = ${cleanEmpName.toLowerCase()}`);
      }
    }
  });
  broadcastBoardUpdate();
}

export async function getAllUsers(): Promise<User[]> {
  await ensureDatabaseReady();
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      active: users.active,
    })
    .from(users)
    .orderBy(asc(users.name));

  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role as Role,
    active: Boolean(r.active),
  }));
}

export async function getRegisteredTeamMemberNames(): Promise<string[]> {
  await ensureDatabaseReady();
  const nameSet = new Set<string>();

  // 1. Collect all active users' names (and email prefix if relevant)
  const allUsers = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.active, 1));

  for (const u of allUsers) {
    if (u.name && u.name.trim() && !u.name.toLowerCase().includes('admin team')) {
      nameSet.add(u.name.trim());
    }
  }

  // 2. Also collect existing board columns
  const cols = await db.select({ name: boardColumns.employeeName }).from(boardColumns);
  for (const c of cols) {
    if (c.name && c.name.trim()) {
      nameSet.add(c.name.trim());
    }
  }

  // 3. Also manager assignments
  const assigns = await db.select({ name: managerAssignments.employeeName }).from(managerAssignments);
  for (const a of assigns) {
    if (a.name && a.name.trim()) {
      nameSet.add(a.name.trim());
    }
  }

  return Array.from(nameSet);
}

export async function createNewUser(params: {
  name: string;
  email: string;
  password: string;
  role: Role;
}): Promise<User> {
  await ensureDatabaseReady();
  const cleanEmail = params.email.trim().toLowerCase();
  const cleanName = params.name.trim();

  if (!cleanName || !cleanEmail || !params.password) {
    throw new Error('Name, email, and password are required.');
  }

  const existing = await getUserByEmail(cleanEmail);
  if (existing) {
    throw new Error(`A user with email ${cleanEmail} already exists.`);
  }

  const id = crypto.randomUUID();
  const salt = bcrypt.genSaltSync(10);
  const cleanPass = params.password.trim();
  const passwordHash = bcrypt.hashSync(cleanPass, salt);
  const now = new Date().toISOString();

  await db.insert(users).values({
    id,
    name: cleanName,
    email: cleanEmail,
    passwordHash,
    role: params.role,
    active: 1,
    createdAt: now,
  });

  // Also update column department or create column if role corresponds to a department
  if (params.role && params.role !== 'admin') {
    const dept = params.role === 'manager' ? 'Managers' : params.role.trim();
    const existingCol = await db
      .select({ id: boardColumns.id })
      .from(boardColumns)
      .where(sql`LOWER(TRIM(${boardColumns.employeeName})) = ${cleanName.toLowerCase()}`)
      .limit(1);

    if (existingCol.length > 0) {
      await db
        .update(boardColumns)
        .set({ department: dept, deletedFromDate: null })
        .where(eq(boardColumns.id, existingCol[0].id));
    } else {
      const allCols = await db.select().from(boardColumns);
      const maxSortOrder = allCols.reduce((max: number, c: any) => Math.max(max, c.sortOrder ?? 0), 0) + 1;
      await db.insert(boardColumns).values({
        id: crypto.randomUUID(),
        employeeName: cleanName,
        department: dept,
        sortOrder: maxSortOrder,
        deletedFromDate: null,
      });
    }
  }

  saveDatabase(true);
  return {
    id,
    name: cleanName,
    email: cleanEmail,
    role: params.role,
    active: true,
  };
}

export async function updateUserDetails(
  userId: string,
  updates: {
    name?: string;
    email?: string;
    role?: Role;
    password?: string;
    active?: boolean;
  }
): Promise<User> {
  await ensureDatabaseReady();
  const target = await getUserById(userId);
  if (!target) {
    throw new Error('User not found.');
  }

  const patch: Record<string, any> = {};

  if (updates.name && updates.name.trim()) {
    patch.name = updates.name.trim();
  }

  if (updates.email && updates.email.trim()) {
    const cleanEmail = updates.email.trim().toLowerCase();
    if (cleanEmail !== target.email.toLowerCase()) {
      const existing = await getUserByEmail(cleanEmail);
      if (existing && existing.id !== userId) {
        throw new Error(`Email ${cleanEmail} is already taken by another account.`);
      }
      patch.email = cleanEmail;
    }
  }

  // Allow setting ANY role (admin, manager, or custom roles)
  if (updates.role && typeof updates.role === 'string' && updates.role.trim()) {
    patch.role = updates.role.trim();
  }

  if (typeof updates.active === 'boolean') {
    patch.active = updates.active ? 1 : 0;
  }

  if (updates.password && updates.password.trim()) {
    const salt = bcrypt.genSaltSync(10);
    patch.passwordHash = bcrypt.hashSync(updates.password.trim(), salt);
  }

  if (Object.keys(patch).length > 0) {
    await db.update(users).set(patch).where(eq(users.id, userId));
  }

  const effectiveName = updates.name?.trim() || target.name;

  // If name was changed, sync boardColumns employeeName
  if (updates.name && updates.name.trim() && updates.name.trim().toLowerCase() !== target.name.toLowerCase().trim()) {
    await db
      .update(boardColumns)
      .set({ employeeName: effectiveName })
      .where(sql`LOWER(TRIM(${boardColumns.employeeName})) = ${target.name.toLowerCase().trim()}`);
  }

  // If role was changed or column sync needed for non-admin
  const newRole = updates.role !== undefined ? updates.role : target.role;
  if (newRole && newRole.toLowerCase() !== 'admin') {
    const dept = newRole === 'manager' ? 'Managers' : newRole.trim();
    const existingCol = await db
      .select({ id: boardColumns.id })
      .from(boardColumns)
      .where(sql`LOWER(TRIM(${boardColumns.employeeName})) = ${effectiveName.toLowerCase().trim()}`)
      .limit(1);

    if (existingCol.length > 0) {
      await db
        .update(boardColumns)
        .set({ department: dept, deletedFromDate: null })
        .where(eq(boardColumns.id, existingCol[0].id));
    } else {
      const maxCol = await db
        .select({ maxOrder: sql<number>`max(${boardColumns.sortOrder})` })
        .from(boardColumns);
      const nextSort = Number(maxCol[0]?.maxOrder || 0) + 1;
      await db.insert(boardColumns).values({
        id: crypto.randomUUID(),
        employeeName: effectiveName,
        department: dept,
        sortOrder: nextSort,
        deletedFromDate: null,
      });
    }
  }

  const refreshed = await getUserById(userId);
  if (!refreshed) throw new Error('User updated but failed to reload.');
  saveDatabase(true);
  return refreshed;
}

export async function getAllRoles(): Promise<Array<{ id: string; name: string; description?: string | null; isSystem: boolean; userCount: number }>> {
  await ensureDatabaseReady();
  const allRoles = await db.select().from(appRoles).orderBy(asc(appRoles.name));
  const userCounts = await db
    .select({
      role: users.role,
      count: sql<number>`count(*)`,
    })
    .from(users)
    .groupBy(users.role);

  const countMap = new Map<string, number>();
  for (const r of userCounts) {
    if (r.role) {
      countMap.set(r.role.toLowerCase(), Number(r.count || 0));
    }
  }

  // Ensure any distinct roles currently present in users table exist in the list
  const existingNames = new Set(allRoles.map((r: any) => r.name.toLowerCase()));
  for (const r of userCounts) {
    if (r.role && !existingNames.has(r.role.toLowerCase()) && r.role.trim()) {
      const newId = crypto.randomUUID();
      try {
        await db.insert(appRoles).values({
          id: newId,
          name: r.role.trim(),
          description: null,
          isSystem: 0,
          createdAt: new Date().toISOString(),
        });
        allRoles.push({
          id: newId,
          name: r.role.trim(),
          description: null,
          isSystem: 0,
          createdAt: new Date().toISOString(),
        } as any);
        existingNames.add(r.role.toLowerCase());
      } catch {
        // already added
      }
    }
  }

  return allRoles.map((r: any) => ({
    id: r.id,
    name: r.name,
    description: r.description || null,
    isSystem: Boolean(r.isSystem),
    userCount: countMap.get(r.name.toLowerCase()) || 0,
  }));
}

export async function createAppRole(name: string, description?: string): Promise<{ id: string; name: string; description?: string | null; isSystem: boolean; userCount: number }> {
  await ensureDatabaseReady();
  const cleanName = (name || '').trim();
  if (!cleanName) {
    throw new Error('Role name cannot be empty.');
  }

  if (cleanName.length > 50) {
    throw new Error('Role name cannot exceed 50 characters.');
  }

  const existing = await db
    .select()
    .from(appRoles)
    .where(sql`LOWER(${appRoles.name}) = ${cleanName.toLowerCase()}`)
    .limit(1);

  if (existing.length > 0) {
    throw new Error(`Role "${cleanName}" already exists.`);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(appRoles).values({
    id,
    name: cleanName,
    description: description?.trim() || null,
    isSystem: 0,
    createdAt: now,
  });

  saveDatabase(true);
  return {
    id,
    name: cleanName,
    description: description?.trim() || null,
    isSystem: false,
    userCount: 0,
  };
}

export async function deleteAppRole(roleId: string): Promise<void> {
  await ensureDatabaseReady();
  const existing = await db.select().from(appRoles).where(eq(appRoles.id, roleId)).limit(1);
  if (existing.length === 0) {
    throw new Error('Role not found.');
  }

  if (Boolean(existing[0].isSystem) || ['admin', 'manager', 'employee'].includes(existing[0].name.toLowerCase())) {
    throw new Error(`Cannot delete built-in system role "${existing[0].name}".`);
  }

  const roleName = existing[0].name;

  // Reassign any users currently assigned this role to 'employee'
  await db
    .update(users)
    .set({ role: 'employee' })
    .where(sql`LOWER(${users.role}) = ${roleName.toLowerCase()}`);

  await db.delete(appRoles).where(eq(appRoles.id, roleId));
  saveDatabase(true);
}

export async function deleteUserAccount(userId: string): Promise<void> {
  await ensureDatabaseReady();
  const target = await getUserById(userId);
  if (!target) {
    throw new Error('User not found.');
  }

  // Prevent deleting the main admin account if it's the last admin
  if (target.role === 'admin') {
    const adminCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(and(eq(users.role, 'admin'), eq(users.active, 1)));

    if (Number(adminCount[0]?.count || 0) <= 1) {
      throw new Error('Cannot delete the last remaining active Admin account.');
    }
  }

  // Remove manager assignments if this user was a manager
  if (target.role === 'manager') {
    await db.delete(managerAssignments).where(eq(managerAssignments.managerId, userId));
    await db
      .update(boardColumns)
      .set({ managerId: null, managerName: null })
      .where(eq(boardColumns.managerId, userId));
  }

  // A task column for an employee goes away when we remove their user account
  const empCols = await db
    .select({ id: boardColumns.id })
    .from(boardColumns)
    .where(sql`LOWER(TRIM(${boardColumns.employeeName})) = ${target.name.toLowerCase().trim()}`);

  for (const c of empCols) {
    const colTasks = await db.select({ id: boardTasks.id }).from(boardTasks).where(eq(boardTasks.columnId, c.id));
    const tIds = colTasks.map((t: any) => t.id);
    if (tIds.length > 0) {
      await db.delete(taskComments).where(inArray(taskComments.taskId, tIds));
      await db.delete(boardTasks).where(inArray(boardTasks.id, tIds));
    }
    await db.delete(columnDateExclusions).where(eq(columnDateExclusions.columnId, c.id));
    await db.delete(boardColumns).where(eq(boardColumns.id, c.id));
  }

  // Delete comments posted by this user
  await db.delete(taskComments).where(eq(taskComments.userId, userId));
  // Delete notifications sent to this user
  await db.delete(notifications).where(eq(notifications.userId, userId));

  await db.delete(users).where(eq(users.id, userId));
  saveDatabase(true);
}

export async function seed15DaysMockData(force: boolean = false): Promise<void> {
  if (!force) {
    const check = await db
      .select({ count: sql<number>`count(*)` })
      .from(boardTasks)
      .where(sql`${boardTasks.assignedDate} IS NOT NULL`);

    if (Number(check[0]?.count || 0) > 0) return;
  }

  console.log('[Database] Seeding 15 days of whiteboard task history into SQLite...');

  await db.transaction(async (tx: any) => {
    await tx.delete(taskComments);
    await tx.delete(boardTasks);
    await tx.delete(boardColumns);
    await tx.delete(boardMeta);

    const now = new Date().toISOString();
    const adminUser = (await getUserByEmail('tech.team@artmetech.in')) || (await getUserByEmail('admin@artmetech.in')) || (await getUserByEmail('admin@office.local'));
    const adminId = adminUser ? adminUser.id : 'admin-alex';

    await tx.insert(boardMeta).values({
      id: 1,
      updatedAt: now,
      publishedBy: adminId,
    });

    const columnsData = [
      { name: 'Swara', department: 'Managers', sortOrder: 0 },
      { name: 'Jinal', department: 'Managers', sortOrder: 1 },
      { name: 'Om', department: 'Editors', sortOrder: 2 },
      { name: 'Hardik', department: 'Editors', sortOrder: 3 },
      { name: 'Ujwal', department: 'Editors', sortOrder: 4 },
      { name: 'Aamir', department: 'Editors', sortOrder: 5 },
      { name: 'Jay', department: 'Designers', sortOrder: 6 },
      { name: 'Tanmay', department: 'Designers', sortOrder: 7 },
      { name: 'Pradeep', department: 'Designers', sortOrder: 8 },
      { name: 'Ashish', department: 'Designers', sortOrder: 9 },
      { name: 'Mehul', department: 'Cinematographers', sortOrder: 10 },
    ];

    const colIds: Record<string, string> = {};
    for (const col of columnsData) {
      const id = crypto.randomUUID();
      colIds[col.name] = id;
      await tx.insert(boardColumns).values({
        id,
        employeeName: col.name,
        department: col.department,
        sortOrder: col.sortOrder,
      });
    }

    async function addMockTask(
      colName: string,
      text: string,
      order: number,
      assignedOffset: number,
      completed: boolean,
      completedBy?: string,
      completedOffset?: number
    ) {
      const colId = colIds[colName];
      if (!colId) return;
      const taskId = crypto.randomUUID();
      const assignedDate = getRelativeDateString(assignedOffset);
      let completedAt: string | null = null;
      if (completed) {
        const cOffset = completedOffset !== undefined ? completedOffset : assignedOffset;
        completedAt = `${getRelativeDateString(cOffset)}T16:30:00.000Z`;
      }

      await tx.insert(boardTasks).values({
        id: taskId,
        columnId: colId,
        text,
        sortOrder: order,
        completed: completed ? 1 : 0,
        completedBy: completed ? (completedBy || colName) : null,
        completedAt,
        assignedDate,
      });
    }

    // Day 0 (Today) tasks for departments
    await addMockTask('Swara', 'Review manager department alignment and team reports', 1, 0, false);
    await addMockTask('Jinal', 'Coordinate cross-department workflow schedules', 1, 0, true, 'Jinal');

    await addMockTask('Om', 'Edit promotional video teaser x 2', 1, 0, false);
    await addMockTask('Hardik', 'Color grade interview clips', 1, 0, true, 'Hardik');
    await addMockTask('Ujwal', 'Sync audio tracks and cut rough assembly', 1, 0, false);
    await addMockTask('Aamir', 'Export 4K final deliverables', 1, 0, false);

    await addMockTask('Jay', 'Design social media banner assets x 4', 1, 0, false);
    await addMockTask('Tanmay', 'Create UI layout mockups in Figma', 1, 0, false);
    await addMockTask('Pradeep', 'Prepare presentation graphics for client review', 1, 0, false);
    await addMockTask('Ashish', 'Finalize typography and color palette icons', 1, 0, false);

    await addMockTask('Mehul', 'Set up studio lighting and camera framing setup', 1, 0, false);

    // Carried forward tasks (Days 1 to 14)
    await addMockTask('Om', 'Review raw footage cuts', 2, 1, false);
    await addMockTask('Tanmay', 'Export style guide assets', 2, 1, true, 'Tanmay', 0);
    await addMockTask('Mehul', 'Check camera lens inventory', 2, 2, false);

    for (let day = 1; day <= 14; day++) {
      await addMockTask('Om', `Edit sprint video chunk ${day}`, 3 + day, day, true, 'Om', day);
      await addMockTask('Tanmay', `Design sprint asset #${day}`, 3 + day, day, true, 'Tanmay', day);
    }
  });

  console.log('[Cloud SQL] 15 days of task data seeded successfully.');
}

function isUserOwnColumn(employeeName: string, user?: User | null): boolean {
  if (!user || !user.name) return false;
  const colName = (employeeName || '').trim().toLowerCase();
  const userName = (user.name || '').trim().toLowerCase();
  const userEmailPrefix = (user.email || '').split('@')[0].trim().toLowerCase();

  return (
    colName === userName ||
    colName.includes(userName) ||
    userName.includes(colName) ||
    colName.replace(/\s+/g, '') === userEmailPrefix.replace(/[^a-z0-9]/g, '')
  );
}

function isEmployeeColumn(employeeName: string, user?: User | null): boolean {
  if (!user || user.role === 'admin') return true;
  return isUserOwnColumn(employeeName, user);
}

export async function getBoard(selectedDate?: string, requestingUser?: User | null): Promise<BoardData> {
  await ensureDatabaseReady();
  await syncTeamColumns();
  const todayStr = getRelativeDateString(0);
  const targetDate = (selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) ? selectedDate : todayStr;

  const metaRows = await db
    .select({
      updatedAt: boardMeta.updatedAt,
      publishedBy: boardMeta.publishedBy,
      publisherName: users.name,
    })
    .from(boardMeta)
    .leftJoin(users, eq(boardMeta.publishedBy, users.id))
    .where(eq(boardMeta.id, 1))
    .limit(1);

  const updatedAt = metaRows[0]?.updatedAt || null;
  const publishedBy = metaRows[0]?.publishedBy || null;
  const publishedByName = metaRows[0]?.publisherName || null;

  const rawColumns = await db
    .select()
    .from(boardColumns)
    .where(
      and(
        sql`(${boardColumns.deletedFromDate} IS NULL OR ${boardColumns.deletedFromDate} > ${targetDate})`,
        sql`LOWER(TRIM(${boardColumns.employeeName})) NOT IN ('shreay', 'aa')`,
        sql`NOT EXISTS (
          SELECT 1 FROM column_date_exclusions 
          WHERE column_date_exclusions.column_id = board_columns.id 
          AND column_date_exclusions.excluded_date = ${targetDate}
        )`
      )
    )
    .orderBy(asc(boardColumns.sortOrder));

  const allAssignments = await db.select().from(managerAssignments);
  const allColumns: BoardColumn[] = [];

  for (const col of rawColumns) {
    const rawTasks = await db
      .select()
      .from(boardTasks)
      .where(
        and(
          eq(boardTasks.columnId, col.id),
          sql`(${boardTasks.assignedDate} IS NULL OR ${boardTasks.assignedDate} <= ${targetDate})`,
          sql`(${boardTasks.completed} = 0 OR ${boardTasks.completedAt} IS NULL OR SUBSTR(${boardTasks.completedAt}, 1, 10) >= ${targetDate})`
        )
      )
      .orderBy(asc(boardTasks.sortOrder));

    const tasks: BoardTask[] = [];

    for (const t of rawTasks) {
      const assignedDate = t.assignedDate || targetDate;
      const isCarriedForward = assignedDate < targetDate;
      const isGivenToday = assignedDate === targetDate;

      const completedAt = t.completedAt || null;
      let isCompletedOnDate = false;
      if (t.completed === 1) {
        if (!completedAt) {
          isCompletedOnDate = true;
        } else {
          const finishedDateStr = completedAt.substring(0, 10);
          isCompletedOnDate = finishedDateStr <= targetDate;
        }
      }

      const rawComments = await db
        .select()
        .from(taskComments)
        .where(eq(taskComments.taskId, t.id))
        .orderBy(asc(taskComments.createdAt));

      const parsedQty = extractTaskQuantity(t.text);
      const totalQty = (t as any).totalQuantity && Number((t as any).totalQuantity) > 1
        ? Number((t as any).totalQuantity)
        : parsedQty.totalQuantity;

      let completedQty = Number((t as any).completedQuantity || 0);
      if (isCompletedOnDate) {
        completedQty = totalQty;
      } else if (completedQty > totalQty) {
        completedQty = totalQty;
      }

      tasks.push({
        id: t.id,
        columnId: col.id,
        text: t.text,
        order: t.sortOrder,
        completed: isCompletedOnDate,
        completedBy: isCompletedOnDate && t.completedBy ? t.completedBy : null,
        completedAt: isCompletedOnDate ? completedAt : null,
        assignedDate,
        originalAssignedDate: assignedDate,
        isCarriedForward,
        isGivenToday,
        isP1: false,
        totalQuantity: totalQty,
        completedQuantity: completedQty,
        adminApproved: Boolean((t as any).adminApproved),
        adminApprovedBy: (t as any).adminApprovedBy || null,
        adminApprovedAt: (t as any).adminApprovedAt || null,
        comments: rawComments.map((c: any) => ({
          id: c.id,
          taskId: c.taskId,
          userId: c.userId,
          userName: c.userName,
          userRole: c.userRole as Role,
          content: c.content,
          createdAt: c.createdAt,
        })),
      });
    }

    tasks.sort((a, b) => (a.order || 0) - (b.order || 0));
    tasks.forEach((t, idx) => {
      t.isP1 = idx === 0;
    });

    const colAssignments = allAssignments.filter(
      (a: any) => a.employeeName.toLowerCase().trim() === col.employeeName.toLowerCase().trim()
    );
    const assignedManagerIds = colAssignments.map((a: any) => a.managerId).filter(Boolean);
    const assignedManagerNames = colAssignments.map((a: any) => a.managerName).filter(Boolean);

    if (col.managerId && !assignedManagerIds.includes(col.managerId)) {
      assignedManagerIds.push(col.managerId);
    }
    if (col.managerName) {
      col.managerName.split(',').forEach((nm: string) => {
        const trimmed = nm.trim();
        if (trimmed && !assignedManagerNames.includes(trimmed)) {
          assignedManagerNames.push(trimmed);
        }
      });
    }

    allColumns.push({
      id: col.id,
      employeeName: col.employeeName,
      department: (col as any).department || 'General',
      sortOrder: col.sortOrder,
      managerId: col.managerId,
      managerName: col.managerName,
      managerIds: assignedManagerIds,
      managerNames: assignedManagerNames,
      tasks,
    });
  }

  const totalTeamColumnsCount = allColumns.length;
  let displayedColumns = allColumns;
  let isManagerFiltered = false;

  // Role Scoping:
  if (requestingUser?.role === 'admin') {
    // Admin always sees every employee column, ordered by sortOrder
    displayedColumns = allColumns;
    displayedColumns.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  } else if (requestingUser?.role === 'manager') {
    // Managers see columns explicitly assigned to them (via manager_assignments or boardColumns), plus their own personal column
    isManagerFiltered = true;
    const assignedRows = await db
      .select({ employeeName: managerAssignments.employeeName })
      .from(managerAssignments)
      .where(eq(managerAssignments.managerId, requestingUser.id));
    const assignedEmpNames = new Set(assignedRows.map((r: any) => r.employeeName.toLowerCase().trim()));

    const scopedColumns = allColumns.filter((col) => {
      const colName = col.employeeName.toLowerCase().trim();
      const matchAssigned = assignedEmpNames.has(colName);
      const matchId = 
        (col.managerId && col.managerId === requestingUser.id) ||
        Boolean(col.managerIds?.includes(requestingUser.id));
      const matchName = 
        (col.managerName && col.managerName.toLowerCase().includes(requestingUser.name.toLowerCase())) ||
        Boolean(col.managerNames?.some((m: string) => m.toLowerCase().includes(requestingUser.name.toLowerCase())));
      const matchSelf = isUserOwnColumn(col.employeeName, requestingUser);
      return Boolean(matchAssigned || matchId || matchName || matchSelf);
    });

    // For managers: their own task column should appear first on the left most side, even if it is empty.
    const myCols = scopedColumns.filter((col) => isUserOwnColumn(col.employeeName, requestingUser));
    const otherCols = scopedColumns.filter((col) => !isUserOwnColumn(col.employeeName, requestingUser));
    otherCols.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    displayedColumns = [...myCols, ...otherCols];
  } else if (requestingUser && requestingUser.role !== 'admin' && requestingUser.role !== 'manager') {
    // Employees and custom team members see ONLY their own personal column and nobody else's
    displayedColumns = allColumns.filter((col) => isUserOwnColumn(col.employeeName, requestingUser));
  } else {
    displayedColumns = allColumns;
    displayedColumns.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }

  // Dynamic date list: include current window, all database task dates, and surrounding targetDate days
  const dateSet = new Set<string>();
  
  // At least 45 days of recent history
  for (let offset = 0; offset <= 45; offset++) {
    dateSet.add(getRelativeDateString(offset));
  }

  // Include any dates where tasks were assigned in the database
  try {
    const dbDates = await db
      .selectDistinct({ d: boardTasks.assignedDate })
      .from(boardTasks)
      .where(sql`${boardTasks.assignedDate} IS NOT NULL`);
    for (const r of dbDates) {
      if (r.d && /^\d{4}-\d{2}-\d{2}$/.test(r.d)) {
        dateSet.add(r.d);
      }
    }
  } catch (err) {
    console.warn('[availableDates] Error fetching distinct task dates:', err);
  }

  // Ensure targetDate is always present
  if (targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    dateSet.add(targetDate);
    // If target date is a historical date, also add surrounding 3 days before and after for smooth strip navigation
    const [tY, tM, tD] = targetDate.split('-').map(Number);
    for (let delta = -3; delta <= 3; delta++) {
      const dObj = new Date(Date.UTC(tY, tM - 1, tD + delta));
      const s = dObj.toISOString().slice(0, 10);
      if (s <= getRelativeDateString(0)) {
        dateSet.add(s);
      }
    }
  }

  // Sort descending: newest first
  const sortedDates = Array.from(dateSet).sort((a, b) => b.localeCompare(a));

  let employeeColumnIds: string[] = [];
  if (requestingUser && requestingUser.role !== 'admin' && requestingUser.role !== 'manager') {
    const allColsForEmpMatch = await db.select({ id: boardColumns.id, employeeName: boardColumns.employeeName }).from(boardColumns);
    employeeColumnIds = allColsForEmpMatch
      .filter((c: any) => isEmployeeColumn(c.employeeName, requestingUser))
      .map((c: any) => c.id);
  }

  const availableDates: Array<{
    date: string;
    label: string;
    dayOfWeek: string;
    totalTasks: number;
    givenCount: number;
    carriedCount: number;
    finishedCount: number;
    pendingCount: number;
  }> = await Promise.all(
    sortedDates.map(async (dStr) => {
      const { label, dayOfWeek } = getDayLabel(dStr);

      let conditions = [
        sql`(${boardTasks.assignedDate} IS NULL OR ${boardTasks.assignedDate} <= ${dStr})`,
        sql`(${boardTasks.completed} = 0 OR ${boardTasks.completedAt} IS NULL OR SUBSTR(${boardTasks.completedAt}, 1, 10) >= ${dStr})`
      ];

      if (requestingUser && requestingUser.role !== 'admin' && requestingUser.role !== 'manager') {
        if (employeeColumnIds.length > 0) {
          conditions.push(inArray(boardTasks.columnId, employeeColumnIds));
        } else {
          conditions.push(sql`1 = 0`);
        }
      }

      const statsRes = await db
        .select({
          total: sql<number>`count(*)`,
          given: sql<number>`sum(CASE WHEN ${boardTasks.assignedDate} = ${dStr} THEN 1 ELSE 0 END)`,
          carried: sql<number>`sum(CASE WHEN ${boardTasks.assignedDate} < ${dStr} THEN 1 ELSE 0 END)`,
          finished: sql<number>`sum(CASE WHEN ${boardTasks.completed} = 1 AND SUBSTR(${boardTasks.completedAt}, 1, 10) = ${dStr} THEN 1 ELSE 0 END)`,
          pending: sql<number>`sum(CASE WHEN ${boardTasks.completed} = 0 OR ${boardTasks.completedAt} IS NULL OR SUBSTR(${boardTasks.completedAt}, 1, 10) > ${dStr} THEN 1 ELSE 0 END)`,
        })
        .from(boardTasks)
        .where(and(...conditions));

      const s = statsRes[0];
      return {
        date: dStr,
        label,
        dayOfWeek,
        totalTasks: Number(s?.total || 0),
        givenCount: Number(s?.given || 0),
        carriedCount: Number(s?.carried || 0),
        finishedCount: Number(s?.finished || 0),
        pendingCount: Number(s?.pending || 0),
      };
    })
  );

  let dailyTotalGiven = 0;
  let dailyTotalCarried = 0;
  let dailyTotalFinished = 0;
  let dailyTotalPending = 0;

  // Columns with tasks appear on the left; empty columns go towards the right end
  displayedColumns.sort((a, b) => {
    const aHasTasks = a.tasks.length > 0;
    const bHasTasks = b.tasks.length > 0;
    if (aHasTasks && !bHasTasks) return -1;
    if (!aHasTasks && bHasTasks) return 1;
    return (a.sortOrder || 0) - (b.sortOrder || 0);
  });

  for (const col of displayedColumns) {
    for (const t of col.tasks) {
      if (t.isGivenToday) dailyTotalGiven++;
      if (t.isCarriedForward) dailyTotalCarried++;
      if (t.completed) dailyTotalFinished++;
      else dailyTotalPending++;
    }
  }

  const dailyStats = {
    date: targetDate,
    totalTasks: dailyTotalGiven + dailyTotalCarried,
    totalGiven: dailyTotalGiven,
    totalCarriedForward: dailyTotalCarried,
    totalFinished: dailyTotalFinished,
    totalPending: dailyTotalPending,
  };

  return {
    columns: displayedColumns,
    totalTeamColumnsCount,
    isManagerFiltered,
    updatedAt,
    publishedBy,
    publishedByName,
    selectedDate: targetDate,
    availableDates,
    dailyStats,
  };
}

export async function replaceBoard(
  employees: Array<{ name: string; tasks: string[] }>,
  publishedByUserId: string,
  forDate?: string
): Promise<BoardData> {
  await ensureDatabaseReady();
  const assignedDate = (forDate && /^\d{4}-\d{2}-\d{2}$/.test(forDate)) ? forDate : getRelativeDateString(0);

  await db.transaction(async (tx: any) => {
    // 1. Delete comments for tasks belonging to this assignedDate
    const existingDateTasks = await tx
      .select({ id: boardTasks.id })
      .from(boardTasks)
      .where(eq(boardTasks.assignedDate, assignedDate));

    for (const dt of existingDateTasks) {
      await tx.delete(taskComments).where(eq(taskComments.taskId, dt.id));
    }

    // 2. Remove previous tasks that were originally assigned to this specific date
    await tx.delete(boardTasks).where(eq(boardTasks.assignedDate, assignedDate));

    // 3. Update board metadata
    const now = new Date().toISOString();
    await tx
      .insert(boardMeta)
      .values({
        id: 1,
        updatedAt: now,
        publishedBy: publishedByUserId,
      })
      .onConflictDoUpdate({
        target: boardMeta.id,
        set: {
          updatedAt: now,
          publishedBy: publishedByUserId,
        },
      });

    // 4. Upsert or create columns for each employee
    const allExistingCols = await tx.select().from(boardColumns);
    const existingColNames = allExistingCols.map((c: any) => c.employeeName);

    // Requirement 3: Columns with tasks appear first on the left, empty columns towards the right end
    const sortedEmployees = [...employees].sort((a: any, b: any) => {
      const aTasks = Array.isArray(a?.tasks) ? a.tasks.length : 0;
      const bTasks = Array.isArray(b?.tasks) ? b.tasks.length : 0;
      if (aTasks > 0 && bTasks === 0) return -1;
      if (aTasks === 0 && bTasks > 0) return 1;
      return 0;
    });

    let colOrder = 0;
    for (const emp of sortedEmployees) {
      let cleanName = (emp.name || '').trim();
      if (!cleanName && (!emp.tasks || emp.tasks.length === 0)) continue;

      // Check if this name matches an existing column directly or via fuzzy match
      let matchedExisting = allExistingCols.find(
        (c: any) => c.employeeName.toLowerCase() === cleanName.toLowerCase()
      );

      if (!matchedExisting && existingColNames.length > 0) {
        const fuzzy = matchToRegisteredTeamMember(cleanName, existingColNames);
        if (fuzzy.confidence !== 'none') {
          matchedExisting = allExistingCols.find(
            (c: any) => c.employeeName.toLowerCase() === fuzzy.matchedName.toLowerCase()
          );
          if (matchedExisting) {
            cleanName = matchedExisting.employeeName;
          }
        }
      }

      let columnId: string;
      const dept = (emp as any).department || (matchedExisting as any)?.department || 'General';

      if (matchedExisting) {
        columnId = matchedExisting.id;
        await tx
          .update(boardColumns)
          .set({ sortOrder: colOrder++, employeeName: cleanName, department: dept, deletedFromDate: null })
          .where(eq(boardColumns.id, columnId));
      } else {
        columnId = crypto.randomUUID();
        const assignRows = await tx
          .select({ managerId: managerAssignments.managerId, managerName: managerAssignments.managerName })
          .from(managerAssignments)
          .where(sql`LOWER(${managerAssignments.employeeName}) = ${cleanName.toLowerCase()}`)
          .limit(1);

        const mgrId = assignRows[0]?.managerId || null;
        const mgrName = assignRows[0]?.managerName || null;

        await tx.insert(boardColumns).values({
          id: columnId,
          employeeName: cleanName || 'Team Member',
          department: dept,
          sortOrder: colOrder++,
          managerId: mgrId,
          managerName: mgrName,
          deletedFromDate: null,
        });
      }

      // 5. Insert new tasks for this employee on the chosen assignedDate
      let taskOrder = 1;
      for (const t of emp.tasks || []) {
        let isDone = false;
        let rawText = '';

        if (typeof t === 'string') {
          rawText = t.trim();
        } else if (t && typeof t === 'object') {
          rawText = typeof (t as any).text === 'string' ? (t as any).text.trim() : '';
          isDone = Boolean((t as any).completed);
        }

        if (!rawText) continue;
        const text = rawText.replace(/^\s*(\[P1\]|P1\s*[-:]|\(P1\)|\bP1\b)\s*/i, '').trim();
        if (!text) continue;

        const taskId = crypto.randomUUID();
        const nowIso = new Date().toISOString();
        const parsedQty = extractTaskQuantity(text);
        const totalQty = (t as any).totalQuantity || parsedQty.totalQuantity;
        const completedQty = isDone ? totalQty : ((t as any).completedQuantity || 0);

        await tx.insert(boardTasks).values({
          id: taskId,
          columnId,
          text,
          sortOrder: taskOrder++,
          completed: isDone ? 1 : 0,
          completedBy: isDone ? 'Whiteboard Strikethrough' : null,
          completedAt: isDone ? nowIso : null,
          assignedDate,
          totalQuantity: totalQty,
          completedQuantity: completedQty,
        });

        notifyEmployeeTaskAssigned({
          employeeName: cleanName,
          taskText: text,
          actorName: 'Admin',
          taskId,
        }).catch((err) => console.error('[Notification error]', err));
      }
    }

    // Reorder sortOrder: columns with tasks appear first on the left, empty columns go towards the right end
    const allFinalCols = await tx.select().from(boardColumns);
    const colsWithTasks = new Set<string>();
    const tasksOnDate = await tx
      .select({ columnId: boardTasks.columnId })
      .from(boardTasks)
      .where(eq(boardTasks.assignedDate, assignedDate));
    for (const t of tasksOnDate) {
      colsWithTasks.add(t.columnId);
    }

    allFinalCols.sort((a: any, b: any) => {
      const aHas = colsWithTasks.has(a.id);
      const bHas = colsWithTasks.has(b.id);
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    });

    for (let i = 0; i < allFinalCols.length; i++) {
      await tx.update(boardColumns).set({ sortOrder: i }).where(eq(boardColumns.id, allFinalCols[i].id));
    }
  });

  saveDatabase(true);
  return getBoard(assignedDate);
}

export async function reorderBoard(
  columns: BoardColumn[],
  forDate?: string,
  requestingUser?: User | null
): Promise<BoardData> {
  await ensureDatabaseReady();
  await db.transaction(async (tx: any) => {
    for (let cIdx = 0; cIdx < columns.length; cIdx++) {
      const col = columns[cIdx];
      await tx
        .update(boardColumns)
        .set({ sortOrder: cIdx })
        .where(eq(boardColumns.id, col.id));

      for (let tIdx = 0; tIdx < col.tasks.length; tIdx++) {
        const task = col.tasks[tIdx];
        await tx
          .update(boardTasks)
          .set({ columnId: col.id, sortOrder: tIdx + 1 })
          .where(eq(boardTasks.id, task.id));
      }
    }

    const now = new Date().toISOString();
    await tx.update(boardMeta).set({ updatedAt: now }).where(eq(boardMeta.id, 1));
  });

  saveDatabase(true);
  return getBoard(forDate, requestingUser);
}

export async function adminEditBoard(
  action: {
    type: 'rename_column' | 'add_column' | 'delete_column' | 'add_task' | 'edit_task' | 'delete_task' | 'delete_day_tasks';
    columnId?: string;
    taskId?: string;
    name?: string;
    text?: string;
    assignedDate?: string;
  },
  forDate?: string,
  requestingUser?: User | null
): Promise<BoardData> {
  await ensureDatabaseReady();
  const targetDate = (forDate && /^\d{4}-\d{2}-\d{2}$/.test(forDate)) ? forDate : getRelativeDateString(0);

  await db.transaction(async (tx: any) => {
    if (action.type === 'rename_column' && action.columnId && action.name) {
      await tx
        .update(boardColumns)
        .set({ employeeName: action.name.trim() })
        .where(eq(boardColumns.id, action.columnId));
    } else if (action.type === 'add_column' && action.name) {
      const cleanName = action.name.trim();
      const existing = await tx
        .select()
        .from(boardColumns)
        .where(sql`LOWER(${boardColumns.employeeName}) = ${cleanName.toLowerCase()}`)
        .limit(1);

      if (existing.length > 0) {
        await tx
          .update(boardColumns)
          .set({ deletedFromDate: null })
          .where(eq(boardColumns.id, existing[0].id));
      } else {
        const countRes = await tx.select({ count: sql<number>`count(*)` }).from(boardColumns);
        const count = Number(countRes[0]?.count || 0);

        await tx.insert(boardColumns).values({
          id: crypto.randomUUID(),
          employeeName: cleanName,
          sortOrder: count,
          deletedFromDate: null,
        });
      }
    } else if (action.type === 'delete_day_tasks') {
      const todayStr = getRelativeDateString(0);
      const isPastDate = targetDate < todayStr;

      if (isPastDate) {
        // Any uncompleted tasks assigned to targetDate must continue rolling into today!
        const uncompleted = await tx
          .select({ id: boardTasks.id })
          .from(boardTasks)
          .where(and(eq(boardTasks.assignedDate, targetDate), eq(boardTasks.completed, 0)));
        const uncompletedIds = uncompleted.map((t: any) => t.id);
        if (uncompletedIds.length > 0) {
          await tx
            .update(boardTasks)
            .set({ assignedDate: todayStr })
            .where(inArray(boardTasks.id, uncompletedIds));
        }

        // Completed tasks for targetDate can be purged from history
        const completed = await tx
          .select({ id: boardTasks.id })
          .from(boardTasks)
          .where(and(eq(boardTasks.assignedDate, targetDate), eq(boardTasks.completed, 1)));
        const compIds = completed.map((t: any) => t.id);
        if (compIds.length > 0) {
          await tx.delete(taskComments).where(inArray(taskComments.taskId, compIds));
          await tx.delete(boardTasks).where(inArray(boardTasks.id, compIds));
        }
      } else {
        // 1. Delete tasks assigned to targetDate (Today)
        const tasksForDate = await tx
          .select({ id: boardTasks.id })
          .from(boardTasks)
          .where(eq(boardTasks.assignedDate, targetDate));
        
        const tIds = tasksForDate.map((t: any) => t.id);
        if (tIds.length > 0) {
          await tx.delete(taskComments).where(inArray(taskComments.taskId, tIds));
          await tx.delete(boardTasks).where(inArray(boardTasks.id, tIds));
        }
      }

      // 2. Exclude all columns currently visible on targetDate for this date
      const visibleCols = await tx
        .select({ id: boardColumns.id })
        .from(boardColumns)
        .where(
          and(
            sql`(${boardColumns.deletedFromDate} IS NULL OR ${boardColumns.deletedFromDate} > ${targetDate})`,
            sql`LOWER(TRIM(${boardColumns.employeeName})) NOT IN ('shreay', 'aa')`
          )
        );

      for (const col of visibleCols) {
        const existingEx = await tx
          .select()
          .from(columnDateExclusions)
          .where(
            and(
              eq(columnDateExclusions.columnId, col.id),
              eq(columnDateExclusions.excludedDate, targetDate)
            )
          )
          .limit(1);

        if (existingEx.length === 0) {
          await tx.insert(columnDateExclusions).values({
            id: crypto.randomUUID(),
            columnId: col.id,
            excludedDate: targetDate,
          });
        }
      }
    } else if ((action.type === 'delete_column' || (action.type as any) === 'clear_column_tasks') && action.columnId) {
      const effectDate = action.assignedDate || targetDate || getRelativeDateString(0);
      const todayStr = getRelativeDateString(0);
      const isPastDate = effectDate < todayStr;

      if (isPastDate) {
        // Clearing a column on a past date:
        // 1. Any uncompleted tasks rolling into today must NOT be wiped out!
        // Advance their assignedDate to todayStr so today's tasklist remains completely preserved,
        // while removing them from this past date.
        const uncompletedPastTasks = await tx
          .select({ id: boardTasks.id })
          .from(boardTasks)
          .where(
            and(
              eq(boardTasks.columnId, action.columnId),
              sql`(${boardTasks.assignedDate} IS NULL OR ${boardTasks.assignedDate} <= ${effectDate})`,
              eq(boardTasks.completed, 0)
            )
          );

        const uncompletedIds = uncompletedPastTasks.map((t: any) => t.id);
        if (uncompletedIds.length > 0) {
          await tx
            .update(boardTasks)
            .set({ assignedDate: todayStr })
            .where(inArray(boardTasks.id, uncompletedIds));
        }

        // 2. Completed tasks on or before this past date are removed from this past day
        const completedPastTasks = await tx
          .select({ id: boardTasks.id })
          .from(boardTasks)
          .where(
            and(
              eq(boardTasks.columnId, action.columnId),
              eq(boardTasks.assignedDate, effectDate),
              eq(boardTasks.completed, 1)
            )
          );
        const completedIds = completedPastTasks.map((t: any) => t.id);
        if (completedIds.length > 0) {
          await tx.delete(taskComments).where(inArray(taskComments.taskId, completedIds));
          await tx.delete(boardTasks).where(inArray(boardTasks.id, completedIds));
        }
      } else if (effectDate > todayStr) {
        // Clearing a column on a future date: only remove tasks assigned to that date.
        // Earlier days' unfinished tasks carry forward onto the future board, but they
        // still belong to today (or whichever day they were given) and must not be wiped.
        const futureTasks = await tx
          .select({ id: boardTasks.id })
          .from(boardTasks)
          .where(
            and(
              eq(boardTasks.columnId, action.columnId),
              eq(boardTasks.assignedDate, effectDate)
            )
          );
        const futureIds = futureTasks.map((t: any) => t.id);
        if (futureIds.length > 0) {
          await tx.delete(taskComments).where(inArray(taskComments.taskId, futureIds));
          await tx.delete(boardTasks).where(inArray(boardTasks.id, futureIds));
        }
      } else {
        // Clearing on today: remove all tasks up to today
        const tasksToClear = await tx
          .select({ id: boardTasks.id })
          .from(boardTasks)
          .where(
            and(
              eq(boardTasks.columnId, action.columnId),
              sql`(${boardTasks.assignedDate} IS NULL OR ${boardTasks.assignedDate} <= ${effectDate})`,
              sql`(${boardTasks.completed} = 0 OR ${boardTasks.completedAt} IS NULL OR SUBSTR(${boardTasks.completedAt}, 1, 10) >= ${effectDate})`
            )
          );

        const clearIds = tasksToClear.map((t: any) => t.id);
        if (clearIds.length > 0) {
          await tx.delete(taskComments).where(inArray(taskComments.taskId, clearIds));
          await tx.delete(boardTasks).where(inArray(boardTasks.id, clearIds));
        }
      }
      // Note: The column itself is NOT removed or soft-deleted. Columns only go away when user account is removed.

    } else if (action.type === 'add_task' && action.columnId && action.text) {
      if (requestingUser && requestingUser.role !== 'admin' && requestingUser.role !== 'manager') {
        const colRows = await tx
          .select({ employeeName: boardColumns.employeeName })
          .from(boardColumns)
          .where(eq(boardColumns.id, action.columnId))
          .limit(1);
        if (!colRows[0] || !isEmployeeColumn(colRows[0].employeeName, requestingUser)) {
          throw new Error('Employees can only add tasks to their own column.');
        }
      }

      const requestedDate = action.assignedDate || targetDate || getRelativeDateString(0);

      const maxOrderRes = await tx
        .select({ maxOrder: sql<number>`coalesce(max(${boardTasks.sortOrder}), 0)` })
        .from(boardTasks)
        .where(eq(boardTasks.columnId, action.columnId));

      const maxOrder = Number(maxOrderRes[0]?.maxOrder || 0);
      const taskAssignedDate = requestedDate;

      const taskId = crypto.randomUUID();
      const parsedQty = extractTaskQuantity(action.text.trim());
      await tx.insert(boardTasks).values({
        id: taskId,
        columnId: action.columnId,
        text: action.text.trim(),
        sortOrder: maxOrder + 1,
        assignedDate: taskAssignedDate,
        totalQuantity: parsedQty.totalQuantity,
        completedQuantity: 0,
      });

      const colRows = await tx
        .select({ employeeName: boardColumns.employeeName })
        .from(boardColumns)
        .where(eq(boardColumns.id, action.columnId))
        .limit(1);

      const employeeName = colRows[0]?.employeeName;
      if (employeeName) {
        notifyEmployeeTaskAssigned({
          employeeName,
          taskText: action.text.trim(),
          actorName: requestingUser?.name || 'Admin',
          taskId,
        }).catch((err) => console.error('[Notification error]', err));
      }
    } else if (action.type === 'edit_task' && action.taskId && action.text) {
      // Managers may only edit tasks on their own column; admins can edit any task
      if (requestingUser && requestingUser.role !== 'admin') {
        const taskCol = await tx
          .select({ employeeName: boardColumns.employeeName })
          .from(boardTasks)
          .innerJoin(boardColumns, eq(boardTasks.columnId, boardColumns.id))
          .where(eq(boardTasks.id, action.taskId))
          .limit(1);
        if (!taskCol[0] || !isUserOwnColumn(taskCol[0].employeeName, requestingUser)) {
          throw new Error('Managers can only edit tasks on their own column.');
        }
      }
      const parsedQty = extractTaskQuantity(action.text.trim());
      await tx
        .update(boardTasks)
        .set({
          text: action.text.trim(),
          totalQuantity: parsedQty.totalQuantity,
        })
        .where(eq(boardTasks.id, action.taskId));
    } else if (action.type === 'delete_task' && action.taskId) {
      const todayStr = getRelativeDateString(0);
      const isPastDate = targetDate < todayStr;

      if (isPastDate) {
        // When deleting a task from a past day:
        // Check if this task is an active/uncompleted task.
        // If it is uncompleted, it rolls into today's active tasklist!
        // Deleting it from the past day removes it from that past day's board,
        // but MUST NOT delete it from today's active tasklist.
        const taskRow = await tx
          .select()
          .from(boardTasks)
          .where(eq(boardTasks.id, action.taskId))
          .limit(1);

        if (taskRow.length > 0 && taskRow[0].completed === 0) {
          // Advance assignedDate to todayStr so it is removed from past dates (where assignedDate <= targetDate),
          // but remains preserved in today's active tasklist!
          await tx
            .update(boardTasks)
            .set({ assignedDate: todayStr })
            .where(eq(boardTasks.id, action.taskId));
        } else {
          // If task was already completed in the past or doesn't roll forward to today, permanently remove it
          await tx.delete(taskComments).where(eq(taskComments.taskId, action.taskId));
          await tx.delete(boardTasks).where(eq(boardTasks.id, action.taskId));
        }
      } else {
        // Deleting while viewing today (or future): permanently delete the task
        await tx.delete(taskComments).where(eq(taskComments.taskId, action.taskId));
        await tx.delete(boardTasks).where(eq(boardTasks.id, action.taskId));
      }
    }

    const now = new Date().toISOString();
    await tx.update(boardMeta).set({ updatedAt: now }).where(eq(boardMeta.id, 1));
  });

  broadcastBoardUpdate();
  return getBoard(targetDate, requestingUser);
}

export async function addTaskComment(
  taskId: string,
  user: User,
  content: string,
  selectedDate?: string
): Promise<{ comment: TaskComment; board: BoardData }> {
  await ensureDatabaseReady();
  const cleanContent = content.trim();
  if (!cleanContent) {
    throw new Error('Comment content cannot be empty.');
  }

  const taskCheck = await db.select({ id: boardTasks.id }).from(boardTasks).where(eq(boardTasks.id, taskId)).limit(1);
  if (taskCheck.length === 0) {
    throw new Error('Task not found.');
  }

  const commentId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(taskComments).values({
    id: commentId,
    taskId,
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    content: cleanContent,
    createdAt: now,
  });

  const comment: TaskComment = {
    id: commentId,
    taskId,
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    content: cleanContent,
    createdAt: now,
  };

  saveDatabase(true);
  const board = await getBoard(selectedDate, user);
  return { comment, board };
}

export async function deleteTaskComment(
  commentId: string,
  user: User,
  selectedDate?: string
): Promise<BoardData> {
  await ensureDatabaseReady();
  const commentRows = await db
    .select({ id: taskComments.id, userId: taskComments.userId })
    .from(taskComments)
    .where(eq(taskComments.id, commentId))
    .limit(1);

  if (commentRows.length === 0) {
    throw new Error('Comment not found.');
  }

  const comment = commentRows[0];
  const isAuthor = comment.userId === user.id;
  const isAuthorized = user.role === 'admin' || user.role === 'manager';
  if (!isAuthorized && !isAuthor) {
    throw new Error('Unauthorized to delete this comment.');
  }

  await db.delete(taskComments).where(eq(taskComments.id, commentId));
  saveDatabase(true);
  return getBoard(selectedDate, user);
}

export async function toggleTaskCompleted(
  taskId: string,
  user: User,
  overrideCompleted?: boolean,
  forDate?: string,
  completedQuantity?: number,
  totalQuantity?: number
): Promise<BoardData> {
  await ensureDatabaseReady();
  const taskRows = await db
    .select({
      id: boardTasks.id,
      text: boardTasks.text,
      columnId: boardTasks.columnId,
      completed: boardTasks.completed,
      assignedDate: boardTasks.assignedDate,
      totalQuantity: boardTasks.totalQuantity,
      completedQuantity: boardTasks.completedQuantity,
    })
    .from(boardTasks)
    .where(eq(boardTasks.id, taskId))
    .limit(1);

  if (taskRows.length === 0) {
    throw new Error('Task not found');
  }

  const task = taskRows[0];
  const parsedQty = extractTaskQuantity(task.text);
  const curTotalQty = totalQuantity !== undefined && totalQuantity > 0
    ? totalQuantity
    : ((task as any).totalQuantity && Number((task as any).totalQuantity) > 1
      ? Number((task as any).totalQuantity)
      : parsedQty.totalQuantity);

  let nextCompletedQty: number;
  let nextStatus: boolean;

  if (completedQuantity !== undefined) {
    nextCompletedQty = Math.max(0, Math.min(curTotalQty, completedQuantity));
    nextStatus = nextCompletedQty >= curTotalQty;
  } else if (overrideCompleted !== undefined) {
    nextStatus = overrideCompleted;
    nextCompletedQty = nextStatus ? curTotalQty : 0;
  } else {
    const currentStatus = Boolean(task.completed);
    nextStatus = !currentStatus;
    nextCompletedQty = nextStatus ? curTotalQty : 0;
  }

  const targetDate = (forDate && /^\d{4}-\d{2}-\d{2}$/.test(forDate)) ? forDate : getRelativeDateString(0);
  const now = new Date().toISOString();
  const completedAtTimestamp = nextStatus
    ? (forDate && forDate !== getRelativeDateString(0) ? `${forDate}T16:00:00.000Z` : now)
    : null;

  const updateFields: any = {
    completed: nextStatus ? 1 : 0,
    completedBy: null,
    completedAt: completedAtTimestamp,
    totalQuantity: curTotalQty,
    completedQuantity: nextCompletedQty,
  };

  // If task is unchecked (not completed), automatically uncheck and revoke admin approval as well
  if (!nextStatus) {
    updateFields.adminApproved = 0;
    updateFields.adminApprovedBy = null;
    updateFields.adminApprovedAt = null;
  }

  await db
    .update(boardTasks)
    .set(updateFields)
    .where(eq(boardTasks.id, taskId));

  // If task transitioned from uncompleted to completed, trigger role-based notifications
  if (nextStatus && !Boolean(task.completed)) {
    const colRows = await db
      .select({
        id: boardColumns.id,
        employeeName: boardColumns.employeeName,
        managerId: boardColumns.managerId,
        managerName: boardColumns.managerName,
      })
      .from(boardColumns)
      .where(eq(boardColumns.id, task.columnId))
      .limit(1);

    const col = colRows[0];
    const employeeName = col?.employeeName || user.name;
    const isBlocked = ['aa', 'shreay'].includes(employeeName.toLowerCase().trim());

    if (!isBlocked) {
      await notifyTaskCompleted({
        employeeName,
        taskText: task.text,
        actorUser: user,
        taskId: task.id,
        columnId: col?.id,
        managerId: col?.managerId,
        managerName: col?.managerName,
      });
    }
  }

  broadcastBoardUpdate();
  saveDatabase(true);
  return getBoard(targetDate, user);
}

export async function adminApproveTask(
  taskId: string,
  approved: boolean,
  targetDate: string,
  adminUser: User
): Promise<BoardData> {
  await ensureDatabaseReady();
  const taskRows = await db.select().from(boardTasks).where(eq(boardTasks.id, taskId)).limit(1);
  if (taskRows.length === 0) {
    throw new Error('Task not found.');
  }
  const task = taskRows[0];

  const now = new Date().toISOString();
  const updateData: any = {
    adminApproved: approved ? 1 : 0,
    adminApprovedBy: approved ? adminUser.name : null,
    adminApprovedAt: approved ? now : null,
  };
  // Admin approval confirms task is finished
  if (approved && !task.completed) {
    updateData.completed = 1;
    updateData.completedAt = now;
  }

  await db
    .update(boardTasks)
    .set(updateData)
    .where(eq(boardTasks.id, taskId));

  // If approved, notify the team member and their manager
  if (approved) {
    const colRows = await db
      .select({
        id: boardColumns.id,
        employeeName: boardColumns.employeeName,
        managerId: boardColumns.managerId,
        managerName: boardColumns.managerName,
      })
      .from(boardColumns)
      .where(eq(boardColumns.id, task.columnId))
      .limit(1);

    const col = colRows[0];
    const employeeName = col?.employeeName || 'Team Member';
    const allUsers = await getAllUsers();

    // 1. Employee user
    const employeeUser = await findUserByEmployeeName(employeeName);

    // 2. Manager user: ONLY managers currently assigned to this employee
    const cleanEmp = employeeName.trim().toLowerCase();
    const assignedManagers: User[] = [];
    const assignRows = await db
      .select({ managerId: managerAssignments.managerId })
      .from(managerAssignments)
      .where(sql`LOWER(TRIM(${managerAssignments.employeeName})) = ${cleanEmp}`);

    for (const a of assignRows) {
      if (a.managerId) {
        const mgr = allUsers.find((u) => u.id === a.managerId && u.role === 'manager');
        if (mgr && !assignedManagers.some((m) => m.id === mgr.id)) {
          assignedManagers.push(mgr);
        }
      }
    }

    if (col?.managerId) {
      const mgr = allUsers.find((u) => u.id === col.managerId && u.role === 'manager');
      if (mgr && !assignedManagers.some((m) => m.id === mgr.id)) {
        assignedManagers.push(mgr);
      }
    }
    if (col?.managerName) {
      const mgr = allUsers.find(
        (u) => u.name.trim().toLowerCase() === col.managerName!.trim().toLowerCase() && u.role === 'manager'
      );
      if (mgr && !assignedManagers.some((m) => m.id === mgr.id)) {
        assignedManagers.push(mgr);
      }
    }

    const recipients: User[] = [];
    if (employeeUser) recipients.push(employeeUser);
    for (const m of assignedManagers) {
      if (!recipients.some((r) => r.id === m.id)) {
        recipients.push(m);
      }
    }

    // 3. Admin users (all admins including the approving admin so the admin dashboard receives notifications)
    const adminUsers = allUsers.filter((u) => u.role === 'admin');
    for (const a of adminUsers) {
      if (!recipients.some((r) => r.id === a.id)) {
        recipients.push(a);
      }
    }
    if (adminUser && !recipients.some((r) => r.id === adminUser.id)) {
      recipients.push(adminUser);
    }

    // Required notification format: Admin approved 'taskName'
    const notifMessage = `Admin approved '${task.text}'`;
    const notifTitle = `Admin approved task`;

    await Promise.all(
      recipients.map((recipient) =>
        createNotification({
          userId: recipient.id,
          userEmail: recipient.email,
          type: 'task_completed',
          title: notifTitle,
          message: notifMessage,
          taskId: task.id,
          taskText: task.text,
          employeeName,
          actorName: adminUser.name,
        })
      )
    );
  }

  broadcastBoardUpdate();
  saveDatabase(true);
  return getBoard(targetDate, adminUser);
}

export interface EmployeeMonthlyReportItem {
  employeeName: string;
  columnId: string;
  managerName?: string;
  totalTasksAssigned: number;
  completedTasks: number;
  pendingTasks: number;
  completionRate: number;
  carryForwardCount: number;
  carriedForwardTasks: Array<{
    id: string;
    text: string;
    assignedDate: string;
    completed: boolean;
    completedAt?: string | null;
  }>;
  changesCount: number;
  changesTasks: Array<{
    id: string;
    text: string;
    assignedDate: string;
    completed: boolean;
    completedAt?: string | null;
  }>;
}

export interface MonthlyReportResponse {
  yearMonth: string;
  monthLabel: string;
  availableMonths: Array<{ value: string; label: string }>;
  summary: {
    totalEmployees: number;
    totalTasks: number;
    totalCompleted: number;
    totalPending: number;
    totalCarryForwards: number;
    totalChanges: number;
    averageCompletionRate: number;
  };
  employees: EmployeeMonthlyReportItem[];
}

export function isChangeTask(taskText: string): boolean {
  if (!taskText) return false;
  const t = taskText.trim().toLowerCase();
  // User spec: Any task that has "changes" written after it is a change
  // Matches "changes" as a word, suffix, or in brackets e.g. "Navbar - changes", "Card layout (changes)", "Fix header changes"
  return /\bchanges?\b/i.test(t);
}

export async function getMonthlyEmployeeReport(
  yearMonth?: string,
  requestingUser?: User
): Promise<MonthlyReportResponse> {
  await ensureDatabaseReady();

  // Validate or default yearMonth (e.g. '2026-09')
  const currentYm = getRelativeDateString(0).slice(0, 7);
  const targetYm = yearMonth && /^\d{4}-\d{2}$/.test(yearMonth) ? yearMonth : currentYm;

  const [yStr, mStr] = targetYm.split('-');
  const yNum = parseInt(yStr, 10);
  const mNum = parseInt(mStr, 10);
  const monthDateObj = new Date(Date.UTC(yNum, mNum - 1, 1));
  const monthLabel = monthDateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  // Compute month start and next month start for boundary checks
  const monthStart = `${targetYm}-01`;
  const nextMonthObj = new Date(Date.UTC(yNum, mNum, 1));
  const nextMonthStart = nextMonthObj.toISOString().slice(0, 10);

  // Discover available months from database tasks + current & last 12 months
  const availableMonthsSet = new Set<string>();
  availableMonthsSet.add(currentYm);
  
  // Last 12 months
  for (let i = 0; i <= 12; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    availableMonthsSet.add(d.toISOString().slice(0, 7));
  }

  // From existing tasks in DB
  try {
    const dbDates = await db
      .selectDistinct({ d: boardTasks.assignedDate })
      .from(boardTasks)
      .where(sql`${boardTasks.assignedDate} IS NOT NULL`);
    for (const r of dbDates) {
      if (r.d && r.d.length >= 7) {
        availableMonthsSet.add(r.d.slice(0, 7));
      }
    }
  } catch (err) {
    console.warn('[MonthlyReport] Failed to fetch task dates:', err);
  }

  const availableMonths = Array.from(availableMonthsSet)
    .sort((a, b) => b.localeCompare(a))
    .map((ym) => {
      const [y, m] = ym.split('-');
      const dObj = new Date(Date.UTC(parseInt(y, 10), parseInt(m, 10) - 1, 1));
      return {
        value: ym,
        label: dObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      };
    });

  // Query all team columns
  let rawColumns = await db
    .select()
    .from(boardColumns)
    .orderBy(asc(boardColumns.sortOrder), asc(boardColumns.employeeName));

  // If requesting user is a manager, filter to their supervised employees
  if (requestingUser && requestingUser.role === 'manager') {
    rawColumns = rawColumns.filter((col: any) => {
      if (col.managerId && col.managerId === requestingUser.id) return true;
      if (col.managerName && col.managerName.toLowerCase() === requestingUser.name.toLowerCase()) return true;
      return false;
    });
  }

  const todayStr = getRelativeDateString(0);
  const employeeReports: EmployeeMonthlyReportItem[] = [];

  for (const col of rawColumns) {
    // Fetch all tasks for this column
    const allColTasks = await db
      .select()
      .from(boardTasks)
      .where(eq(boardTasks.columnId, col.id))
      .orderBy(asc(boardTasks.assignedDate), asc(boardTasks.sortOrder));

    // Tasks active or assigned in this target month:
    // 1) Assigned in this month: assignedDate starts with targetYm
    // 2) OR assigned before this month, and was still unfinished or completed during this month
    const monthTasks = allColTasks.filter((t: any) => {
      const aDate = t.assignedDate || todayStr;
      if (aDate.startsWith(targetYm)) return true;
      if (aDate < monthStart) {
        // Was it still active or completed in this month?
        if (t.completed === 0) return true;
        if (t.completedAt && t.completedAt.substring(0, 7) >= targetYm) return true;
      }
      return false;
    });

    let completedTasks = 0;
    let pendingTasks = 0;
    const carriedForwardTasks: EmployeeMonthlyReportItem['carriedForwardTasks'] = [];
    const changesTasks: EmployeeMonthlyReportItem['changesTasks'] = [];

    for (const t of monthTasks) {
      const aDate = t.assignedDate || todayStr;
      const isCompleted = t.completed === 1;
      const compDateStr = t.completedAt ? t.completedAt.substring(0, 10) : null;

      // Completion calculation for the month
      if (isCompleted && (!compDateStr || compDateStr.substring(0, 7) <= targetYm)) {
        completedTasks++;
      } else {
        pendingTasks++;
      }

      // Check for "changes" task:
      // Spec: Any task that has "changes" written after it is a change
      if (isChangeTask(t.text)) {
        changesTasks.push({
          id: t.id,
          text: t.text,
          assignedDate: aDate,
          completed: isCompleted,
          completedAt: t.completedAt,
        });
      }

      // Check for Carry Forward:
      // A task is carried forward in this month if:
      // a) Assigned before this month (aDate < monthStart) -> carried over into this month
      // b) Assigned in this month, and completed on a date later than aDate, or still pending past aDate
      let isCarryForward = false;
      if (aDate < monthStart) {
        isCarryForward = true;
      } else if (aDate.startsWith(targetYm)) {
        if (compDateStr && compDateStr > aDate) {
          isCarryForward = true;
        } else if (!isCompleted && aDate < todayStr) {
          isCarryForward = true;
        }
      }

      if (isCarryForward) {
        carriedForwardTasks.push({
          id: t.id,
          text: t.text,
          assignedDate: aDate,
          completed: isCompleted,
          completedAt: t.completedAt,
        });
      }
    }

    const totalTasksAssigned = monthTasks.length;
    const completionRate = totalTasksAssigned > 0 ? Math.round((completedTasks / totalTasksAssigned) * 100) : 0;

    employeeReports.push({
      employeeName: col.employeeName,
      columnId: col.id,
      managerName: col.managerName || undefined,
      totalTasksAssigned,
      completedTasks,
      pendingTasks,
      completionRate,
      carryForwardCount: carriedForwardTasks.length,
      carriedForwardTasks,
      changesCount: changesTasks.length,
      changesTasks,
    });
  }

  // Summary aggregation
  const totalEmployees = employeeReports.length;
  const totalTasks = employeeReports.reduce((sum, e) => sum + e.totalTasksAssigned, 0);
  const totalCompleted = employeeReports.reduce((sum, e) => sum + e.completedTasks, 0);
  const totalPending = employeeReports.reduce((sum, e) => sum + e.pendingTasks, 0);
  const totalCarryForwards = employeeReports.reduce((sum, e) => sum + e.carryForwardCount, 0);
  const totalChanges = employeeReports.reduce((sum, e) => sum + e.changesCount, 0);
  const averageCompletionRate = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;

  return {
    yearMonth: targetYm,
    monthLabel,
    availableMonths,
    summary: {
      totalEmployees,
      totalTasks,
      totalCompleted,
      totalPending,
      totalCarryForwards,
      totalChanges,
      averageCompletionRate,
    },
    employees: employeeReports,
  };
}

/**
 * Updates the department of a team column (e.g. Editors, Designers, Managers, Cinematographers)
 */
export async function updateColumnDepartment(
  columnId: string,
  department: string,
  user?: User
): Promise<BoardData> {
  await ensureDatabaseReady();
  const cleanDept = (department || 'General').trim();

  await db
    .update(boardColumns)
    .set({ department: cleanDept })
    .where(eq(boardColumns.id, columnId));

  console.log(`[Department] Column ${columnId} updated to department "${cleanDept}" by ${user?.name || 'Admin'}`);
  return getBoard(undefined, user);
}

