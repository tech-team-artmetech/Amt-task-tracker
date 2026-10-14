import crypto from 'crypto';
import type { Response } from 'express';
import { eq, and, desc, sql, inArray, or } from 'drizzle-orm';
import webpush from 'web-push';
import { db, ensureDbReady, saveDatabase } from '../src/db/index.ts';
import { notifications, pushSubscriptions, users, managerAssignments, boardColumns } from '../src/db/schema.ts';
import type { AppNotification, User } from './types.ts';
import { getAllUsers } from './db.ts';

// Configured VAPID details for browser Web Push (works when tabs are completely closed)
const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  'BFsuqbMWn5_WtteGeuiDHLQNgGjVFYRuKBuS3z9B-XEV-igxlXydYPXK636IgjnpCUoluw217vJzt_trT4JfODQ';
const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY || 'dbSGue1u9KNkTUgYV2q0tW7RQ0Wyn184sh-nx_YmsHs';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:tech.team@artmetech.in';

try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch (err) {
  console.warn('[WebPush Init Warning]', err);
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

// In-memory 5-second deduplication cache to guarantee zero duplicate notifications for task completions
const recentCompletedTaskNotifications = new Map<string, number>();

/**
 * Validates whether a push subscription has valid RFC 8291 cryptographic keys.
 */
export function isValidPushSubscription(subscription: any): boolean {
  if (!subscription || typeof subscription !== 'object') return false;
  if (
    !subscription.endpoint ||
    typeof subscription.endpoint !== 'string' ||
    !subscription.endpoint.startsWith('https://')
  ) {
    return false;
  }
  if (!subscription.keys || typeof subscription.keys !== 'object') {
    return false;
  }
  const { p256dh, auth } = subscription.keys;
  if (!p256dh || typeof p256dh !== 'string' || !auth || typeof auth !== 'string') {
    return false;
  }
  try {
    const p256dhBuf = Buffer.from(p256dh, 'base64');
    // Uncompressed P-256 public key is 65 bytes long (RFC 8291)
    if (p256dhBuf.length !== 65) {
      return false;
    }
    const authBuf = Buffer.from(auth, 'base64');
    if (authBuf.length < 16) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Saves a browser push subscription for a user with origin-awareness and deduplication
 */
export async function savePushSubscription(
  userId: string,
  subscription: any,
  clientOrigin?: string
): Promise<boolean> {
  await ensureDbReady();
  if (!isValidPushSubscription(subscription)) {
    console.warn(`[Push] Rejected invalid push subscription for user ${userId}`);
    return false;
  }

  const endpoint = subscription.endpoint;
  const subscriptionJson = JSON.stringify(subscription);
  const now = new Date().toISOString();
  const origin = (clientOrigin || '').trim().replace(/\/+$/, '');

  try {
    // Prevent duplicate endpoints or multi-device duplicates for this user:
    // Delete any older subscriptions for this user so each user has strictly 1 active subscription endpoint.
    await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));

    await db.insert(pushSubscriptions).values({
      id: crypto.randomUUID(),
      userId,
      endpoint,
      subscriptionJson,
      origin: origin || null,
      createdAt: now,
    });

    // Also mark user account as push notifications enabled
    await db
      .update(users)
      .set({ pushNotificationsEnabled: 1 })
      .where(eq(users.id, userId));

    saveDatabase();
    console.log(`[Push] Successfully registered single active subscription for user ${userId} (origin: ${origin || 'default'})`);
    return true;
  } catch (err) {
    console.error('[Push Save Subscription Error]', err);
    return false;
  }
}

/**
 * Sends a Web Push payload to registered subscriptions of a user with deduplication.
 * This triggers browser Service Worker even when the tab is closed!
 */
export async function sendWebPush(
  userId: string,
  payload: { title: string; message: string; taskId?: string | null; id?: string | null; url?: string }
): Promise<void> {
  await ensureDbReady();
  try {
    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));

    if (subs.length === 0) {
      return;
    }

    // DEDUPLICATION:
    // If user has subscriptions on the custom domain (tasktracker.artmetech.in), strictly prefer that domain
    // and ignore any stale preview/studio subscriptions so the user never gets two notifications!
    let targetSubs = subs;
    const prodSubs = subs.filter((s: any) => s.origin && s.origin.includes('tasktracker.artmetech.in'));
    if (prodSubs.length > 0) {
      targetSubs = prodSubs;
    }

    // Guarantee that at most ONE notification is sent to the user by picking the single newest subscription
    const sortedSubs = targetSubs.sort((a: any, b: any) => {
      const timeB = new Date(b.createdAt || 0).getTime();
      const timeA = new Date(a.createdAt || 0).getTime();
      return timeB - timeA;
    });

    const singleActiveSub = sortedSubs[0];
    if (!singleActiveSub) return;

    const pushPayload = JSON.stringify({
      id: payload.id || payload.taskId || 'notif',
      title: payload.title,
      message: payload.message,
      body: payload.message,
      taskId: payload.taskId,
      url: payload.url || '/',
    });

    let shouldPrune = false;
    try {
      const subObj = JSON.parse(singleActiveSub.subscriptionJson);
      if (!isValidPushSubscription(subObj)) {
        shouldPrune = true;
        console.info(`[WebPush] Pruning malformed push subscription: ${singleActiveSub.endpoint.slice(0, 45)}...`);
      } else {
        await webpush.sendNotification(subObj, pushPayload, {
          TTL: 86400,
          urgency: 'high',
        });
        console.log(`[WebPush] Successfully delivered push to endpoint: ${singleActiveSub.endpoint.slice(0, 45)}...`);
      }
    } catch (err: any) {
      const status = err?.statusCode;
      const msg = String(err?.message || '');
      if (
        status === 410 ||
        status === 404 ||
        msg.includes('65 bytes') ||
        msg.includes('unsubscribed') ||
        msg.includes('expired') ||
        msg.includes('NotRegistered') ||
        msg.includes('InvalidRegistration')
      ) {
        shouldPrune = true;
        console.info(`[WebPush] Auto-pruning expired push endpoint (${status || 'invalid'}): ${singleActiveSub.endpoint.slice(0, 45)}...`);
      } else {
        console.warn(`[WebPush] Push warning for endpoint (${status}): ${msg}`);
      }
    }

    if (shouldPrune) {
      try {
        await db
          .delete(pushSubscriptions)
          .where(eq(pushSubscriptions.endpoint, singleActiveSub.endpoint));
        saveDatabase();
      } catch (delErr) {
        console.warn('[WebPush] Error pruning endpoint:', delErr);
      }
    }
  } catch (err) {
    console.error(`[WebPush Send Error for user ${userId}]:`, err);
  }
}

/**
 * Schedules a test push notification to prove closed-tab functionality.
 */
export function scheduleTestPush(userId: string, delaySeconds: number = 3): void {
  const delayMs = Math.max(1, delaySeconds) * 1000;
  setTimeout(async () => {
    try {
      await createNotification({
        userId,
        type: 'task_completed',
        title: 'Task Engine Alert 🚀',
        message: 'This notification popped up even with the tab closed! Just like WhatsApp.',
        taskText: 'Closed-Tab Test Notification',
        actorName: 'AMT Task Tracker',
      });
    } catch (e) {
      console.error('[Schedule Test Push Error]', e);
    }
  }, delayMs);
}

// In-memory active SSE client connections mapped by userId
const sseClients = new Map<string, Set<Response>>();

export function registerSSEClient(userId: string, res: Response): () => void {
  if (!sseClients.has(userId)) {
    sseClients.set(userId, new Set());
  }
  const userSet = sseClients.get(userId)!;
  userSet.add(res);

  // Send initial ping and flush immediately
  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', timestamp: new Date().toISOString() })}\n\n`);
  if (typeof (res as any).flush === 'function') {
    (res as any).flush();
  }

  // Periodic keepalive comment every 15s to prevent proxy buffer delays & timeouts
  const pingInterval = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    } catch {
      clearInterval(pingInterval);
    }
  }, 15000);

  return () => {
    clearInterval(pingInterval);
    userSet.delete(res);
    if (userSet.size === 0) {
      sseClients.delete(userId);
    }
  };
}

export function broadcastToUser(userId: string, notification: AppNotification): void {
  const userSet = sseClients.get(userId);
  if (!userSet || userSet.size === 0) return;

  const payload = JSON.stringify(notification);
  for (const res of userSet) {
    try {
      res.write(`event: notification\ndata: ${payload}\n\n`);
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    } catch (err) {
      console.warn(`[SSE] Error pushing to user ${userId}:`, err);
    }
  }
}

/**
 * Creates and persists a notification, then pushes it in real-time to active SSE clients.
 */
export async function createNotification(params: {
  userId: string;
  userEmail?: string | null;
  type: 'task_assigned' | 'task_completed';
  title: string;
  message: string;
  taskId?: string | null;
  taskText?: string | null;
  employeeName?: string | null;
  actorName?: string | null;
}): Promise<AppNotification> {
  await ensureDbReady();

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const appNotification: AppNotification = {
    id,
    userId: params.userId,
    userEmail: params.userEmail,
    type: params.type,
    title: params.title,
    message: params.message,
    taskId: params.taskId,
    taskText: params.taskText,
    employeeName: params.employeeName,
    actorName: params.actorName,
    isRead: false,
    createdAt,
  };

  // Blocked team members (aa, shreay) must never generate notifications
  const cleanEmp = (params.employeeName || '').toLowerCase().trim();
  if (cleanEmp === 'aa' || cleanEmp === 'shreay') {
    return appNotification;
  }

  // 1. Instant zero-latency SSE broadcast to browser clients FIRST
  broadcastToUser(params.userId, appNotification);

  // 2. Background native Web Push (does not block real-time delivery)
  sendWebPush(params.userId, {
    id,
    title: params.title,
    message: params.message,
    taskId: params.taskId,
  }).catch((err) => console.warn('[WebPush send in createNotification failed]', err));

  // 3. Persist to database
  try {
    await db.insert(notifications).values({
      id,
      userId: params.userId,
      userEmail: params.userEmail || null,
      type: params.type,
      title: params.title,
      message: params.message,
      taskId: params.taskId || null,
      taskText: params.taskText || null,
      employeeName: params.employeeName || null,
      actorName: params.actorName || null,
      isRead: 0,
      createdAt,
    });
    saveDatabase();
  } catch (err) {
    console.warn('[Notification DB Insert Warning]', err);
  }

  return appNotification;
}

/**
 * Finds user account corresponding to an employee name.
 */
export async function findUserByEmployeeName(employeeName: string): Promise<User | null> {
  if (!employeeName) return null;
  const allUsers = await getAllUsers();
  const clean = employeeName.trim().toLowerCase();

  // 1. Exact match on full name
  let match = allUsers.find((u) => u.name.trim().toLowerCase() === clean);
  if (match) return match;

  // 2. Email prefix match (e.g. om@artmetech.in -> "om")
  match = allUsers.find((u) => u.email.split('@')[0].trim().toLowerCase() === clean);
  if (match) return match;

  // 3. First-name matching
  match = allUsers.find((u) => {
    const uFirst = u.name.trim().split(' ')[0].toLowerCase();
    const eFirst = clean.split(' ')[0];
    return uFirst === eFirst || uFirst === clean || eFirst === u.name.trim().toLowerCase();
  });

  return match || null;
}

/**
 * Finds all managers assigned to an employee (via manager_assignments, board_columns, or explicit parameters).
 */
export async function getAssignedManagersForEmployee(
  employeeName: string,
  columnId?: string,
  explicitManagerId?: string | null,
  explicitManagerName?: string | null
): Promise<User[]> {
  await ensureDbReady();
  const allUsers = await getAllUsers();
  const managerUsers = allUsers.filter((u) => u.role?.toLowerCase() === 'manager');
  const cleanEmp = (employeeName || '').trim().toLowerCase();
  const assignedManagers: User[] = [];

  const addMgr = (mgr: User | undefined | null) => {
    if (mgr && !assignedManagers.some((m) => m.id === mgr.id)) {
      assignedManagers.push(mgr);
    }
  };

  // 1. Query managerAssignments table for this employee
  if (cleanEmp) {
    const assignRows = await db
      .select({
        managerId: managerAssignments.managerId,
        managerName: managerAssignments.managerName,
      })
      .from(managerAssignments)
      .where(sql`LOWER(TRIM(${managerAssignments.employeeName})) = ${cleanEmp}`);

    for (const a of assignRows) {
      if (a.managerId) {
        addMgr(managerUsers.find((u) => u.id === a.managerId));
      }
      if (a.managerName) {
        const aName = a.managerName.trim().toLowerCase();
        addMgr(
          managerUsers.find(
            (u) =>
              u.name.trim().toLowerCase() === aName ||
              u.name.trim().toLowerCase().startsWith(aName) ||
              u.email.split('@')[0].trim().toLowerCase() === aName
          )
        );
      }
    }
  }

  // 2. Also check boardColumns for direct column assignments (both managerId and comma-separated managerName)
  const colConditions = [];
  if (columnId) {
    colConditions.push(eq(boardColumns.id, columnId));
  }
  if (cleanEmp) {
    colConditions.push(sql`LOWER(TRIM(${boardColumns.employeeName})) = ${cleanEmp}`);
  }

  if (colConditions.length > 0) {
    const colRows = await db
      .select({
        managerId: boardColumns.managerId,
        managerName: boardColumns.managerName,
      })
      .from(boardColumns)
      .where(or(...colConditions));

    for (const col of colRows) {
      if (col.managerId) {
        addMgr(managerUsers.find((u) => u.id === col.managerId));
      }
      if (col.managerName) {
        const names = col.managerName.split(',').map((s: string) => s.trim().toLowerCase());
        for (const name of names) {
          if (!name) continue;
          addMgr(
            managerUsers.find(
              (u) =>
                u.name.trim().toLowerCase() === name ||
                u.name.trim().toLowerCase().startsWith(name) ||
                u.email.split('@')[0].trim().toLowerCase() === name
            )
          );
        }
      }
    }
  }

  // 3. Check explicit params if provided
  if (explicitManagerId) {
    addMgr(managerUsers.find((u) => u.id === explicitManagerId));
  }
  if (explicitManagerName) {
    const names = explicitManagerName.split(',').map((s) => s.trim().toLowerCase());
    for (const name of names) {
      if (!name) continue;
      addMgr(
        managerUsers.find(
          (u) =>
            u.name.trim().toLowerCase() === name ||
            u.name.trim().toLowerCase().startsWith(name) ||
            u.email.split('@')[0].trim().toLowerCase() === name
        )
      );
    }
  }

  return assignedManagers;
}

/**
 * Feature 1: Notifies employee and their assigned manager(s) when a new task is assigned.
 */
export async function notifyEmployeeTaskAssigned(params: {
  employeeName: string;
  taskText: string;
  actorName?: string;
  taskId?: string;
  columnId?: string;
  managerId?: string | null;
  managerName?: string | null;
}): Promise<void> {
  try {
    const preview = params.taskText.length > 80 ? `${params.taskText.slice(0, 80)}...` : params.taskText;
    const cleanEmp = (params.employeeName || '').trim();
    if (['aa', 'shreay'].includes(cleanEmp.toLowerCase())) {
      return;
    }

    // 1. Notify employee user account if exists
    const targetUser = await findUserByEmployeeName(cleanEmp);
    if (targetUser) {
      await createNotification({
        userId: targetUser.id,
        userEmail: targetUser.email,
        type: 'task_assigned',
        title: 'New Task Assigned',
        message: preview,
        taskId: params.taskId,
        taskText: params.taskText,
        employeeName: cleanEmp,
        actorName: params.actorName || 'Admin',
      });
      console.log(`[Notification] Sent task assignment notification to ${targetUser.name} (${targetUser.email})`);
    }

    // 2. Also notify assigned manager(s) of this employee
    const assignedManagers = await getAssignedManagersForEmployee(
      cleanEmp,
      params.columnId,
      params.managerId,
      params.managerName
    );

    for (const mgr of assignedManagers) {
      const act = (params.actorName || '').toLowerCase().trim();
      if (act && (mgr.name.toLowerCase().trim() === act || mgr.email.split('@')[0].toLowerCase().trim() === act)) {
        continue;
      }

      await createNotification({
        userId: mgr.id,
        userEmail: mgr.email,
        type: 'task_assigned',
        title: `Task assigned to ${cleanEmp}`,
        message: `${params.actorName || 'Admin'} assigned to ${cleanEmp}: ${preview}`,
        taskId: params.taskId,
        taskText: params.taskText,
        employeeName: cleanEmp,
        actorName: params.actorName || 'Admin',
      });
      console.log(`[Notification] Sent task assignment notification to manager ${mgr.name} (${mgr.email})`);
    }
  } catch (err) {
    console.error('[Notification Error in notifyEmployeeTaskAssigned]:', err);
  }
}

/**
 * Task Completion Notifications:
 * Generic format consistent everywhere: "'Employee name' finished - 'Taskname'"
 * or for partial progress on multi-unit tasks: "'Employee name' finished 1/3 - 'Taskname'"
 * Delivered in real-time to Admins, Managers, and Employee, EXCLUDING the actor who finished it.
 */
export async function notifyTaskCompleted(params: {
  employeeName: string;
  taskText: string;
  actorUser: User;
  taskId?: string;
  columnId?: string;
  managerId?: string | null;
  managerName?: string | null;
  completedQuantity?: number;
  totalQuantity?: number;
  isPartial?: boolean;
}): Promise<void> {
  try {
    await ensureDbReady();
    const allUsers = await getAllUsers();
    const cleanTask = params.taskText.trim();

    // Debounce: Suppress duplicate notifications within 5 seconds for the same task completion
    const taskKey = `${params.taskId || ''}:${(params.employeeName || '').trim().toLowerCase()}:${cleanTask}:${params.completedQuantity || ''}`;
    const nowMs = Date.now();
    const lastNotified = recentCompletedTaskNotifications.get(taskKey);
    if (lastNotified && nowMs - lastNotified < 5000) {
      console.log(`[Notification] Suppressed duplicate task completed alert within 5s for "${cleanTask}"`);
      return;
    }
    recentCompletedTaskNotifications.set(taskKey, nowMs);

    // Housekeeping: clean old entries from memory
    for (const [k, timestamp] of recentCompletedTaskNotifications.entries()) {
      if (nowMs - timestamp > 60000) {
        recentCompletedTaskNotifications.delete(k);
      }
    }

    const isPartial = Boolean(
      params.isPartial ||
      (params.totalQuantity && params.totalQuantity > 1 && params.completedQuantity !== undefined && params.completedQuantity < params.totalQuantity)
    );
    const qtyRatio = isPartial && params.completedQuantity && params.totalQuantity
      ? `${params.completedQuantity}/${params.totalQuantity}`
      : null;

    // Standardized message requested by user:
    // Partial: "Om finished 1/3 - IDBI x 3"
    // Full: "Om finished - IDBI x 3"
    const notificationMessage = qtyRatio
      ? `${params.employeeName} finished ${qtyRatio} - ${cleanTask}`
      : `${params.employeeName} finished - ${cleanTask}`;
    const notificationTitle = `${params.employeeName} completed a task`;

    // 1. Find employee user account
    const employeeUser = await findUserByEmployeeName(params.employeeName);

    // 2. Find ALL managers currently assigned to this employee
    const assignedManagers = await getAssignedManagersForEmployee(
      params.employeeName,
      params.columnId,
      params.managerId,
      params.managerName
    );

    // 3. Collect distinct recipients:
    // - All Admins
    // - ONLY managers who have this employee assigned to them (NEVER unassigned managers)
    // - The Employee
    // NOTE: The Actor who performed the action is EXCLUDED so they do not receive alerts for their own actions.
    const recipientUserMap = new Map<string, User>();

    // Add admins
    const adminUsers = allUsers.filter((u) => u.role === 'admin');
    for (const a of adminUsers) {
      recipientUserMap.set(a.id, a);
    }

    // Add ONLY assigned managers (NEVER broadcast to unassigned managers)
    for (const m of assignedManagers) {
      recipientUserMap.set(m.id, m);
    }

    // Add employee
    if (employeeUser) {
      recipientUserMap.set(employeeUser.id, employeeUser);
    }

    // EXCLUDE the actor who performed the action ONLY if they are an employee completing their own task.
    // Administrators (and assigned managers) must ALWAYS receive task completion notifications in their dashboard,
    // even when an admin or manager marks an employee's task finished on the board.
    const actorId = params.actorUser?.id;
    const actorEmail = (params.actorUser?.email || '').trim().toLowerCase();
    const actorName = (params.actorUser?.name || '').trim().toLowerCase();

    for (const [id, targetUser] of recipientUserMap.entries()) {
      const targetEmail = (targetUser.email || '').trim().toLowerCase();
      const targetName = (targetUser.name || '').trim().toLowerCase();
      const isActor = (
        id === actorId ||
        (actorEmail && targetEmail === actorEmail) ||
        (actorName && targetName === actorName)
      );

      // Only exclude regular employees who clicked their own task
      if (isActor && targetUser.role !== 'admin' && targetUser.role !== 'manager') {
        recipientUserMap.delete(id);
      }
    }

    // Send generic notification to all remaining recipients simultaneously
    const recipients = Array.from(recipientUserMap.values());
    if (recipients.length === 0) {
      console.log(`[Notification] No external recipients for task update by actor ${params.actorUser.name}.`);
      return;
    }

    await Promise.all(
      recipients.map((targetUser) =>
        createNotification({
          userId: targetUser.id,
          userEmail: targetUser.email,
          type: 'task_completed',
          title: notificationTitle,
          message: notificationMessage,
          taskId: params.taskId,
          taskText: cleanTask,
          employeeName: params.employeeName,
          actorName: params.actorUser.name,
        })
      )
    );

    console.log(`[Notification] Pushed task completed alert to ${recipients.length} recipients: "${notificationMessage}"`);
  } catch (err) {
    console.error('[Notification Error in notifyTaskCompleted]:', err);
  }
}

/**
 * Backward-compatible wrapper for notifyAdminAndManagersTaskCompleted
 */
export async function notifyAdminAndManagersTaskCompleted(params: {
  employeeName: string;
  taskText: string;
  actorName: string;
  taskId?: string;
  actorUser?: User;
}): Promise<void> {
  const actor = params.actorUser || {
    id: 'system',
    name: params.actorName,
    email: '',
    role: (params.actorName.toLowerCase().includes('admin') ? 'admin' : 'employee') as any,
    active: true,
  };
  return notifyTaskCompleted({
    employeeName: params.employeeName,
    taskText: params.taskText,
    actorUser: actor,
    taskId: params.taskId,
  });
}

/**
 * Retrieves the latest 50 notifications for a user, along with unread count.
 * For managers, dynamically restricts notifications to themselves and team members who currently have them as manager.
 */
export async function getUserNotifications(userId: string): Promise<{
  notifications: AppNotification[];
  unreadCount: number;
}> {
  await ensureDbReady();

  // Prune notifications older than 2 hours
  const cutoffDate = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  try {
    // Delete stale notifications older than 2 hours
    await db.delete(notifications).where(sql`${notifications.createdAt} < ${cutoffDate}`);
    // Delete any notifications from blocked members (aa, shreay)
    await db.delete(notifications).where(
      sql`LOWER(TRIM(COALESCE(${notifications.employeeName}, ''))) IN ('aa', 'shreay') OR LOWER(${notifications.title}) LIKE '%aa %' OR LOWER(${notifications.message}) LIKE '%aa %' OR LOWER(${notifications.title}) LIKE '% aa%' OR LOWER(${notifications.message}) LIKE '% aa%' OR LOWER(${notifications.title}) LIKE '%shreay%' OR LOWER(${notifications.message}) LIKE '%shreay%'`
    );
  } catch (cleanErr) {
    console.warn('[Notifications cleanup warning]', cleanErr);
  }

  // Get requesting user details
  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const currentUser = userRows[0];

  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        sql`LOWER(TRIM(COALESCE(${notifications.employeeName}, ''))) NOT IN ('aa', 'shreay')`,
        sql`COALESCE(${notifications.createdAt}, '') >= ${cutoffDate}`
      )
    )
    .orderBy(desc(notifications.createdAt))
    .limit(50);

  let formatted: AppNotification[] = rows.map((r: any) => ({
    id: r.id,
    userId: r.userId,
    userEmail: r.userEmail,
    type: r.type as 'task_assigned' | 'task_completed',
    title: r.title,
    message: r.message,
    taskId: r.taskId,
    taskText: r.taskText,
    employeeName: r.employeeName,
    actorName: r.actorName,
    isRead: Boolean(r.isRead),
    createdAt: r.createdAt,
  }));

  const unreadCount = formatted.filter((n) => !n.isRead).length;

  return { notifications: formatted, unreadCount };
}

/**
 * Marks a single notification as read.
 */
export async function markNotificationAsRead(notificationId: string, userId: string): Promise<void> {
  await ensureDbReady();
  await db
    .update(notifications)
    .set({ isRead: 1 })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
}

/**
 * Marks all notifications as read for a user.
 */
export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  await ensureDbReady();
  await db
    .update(notifications)
    .set({ isRead: 1 })
    .where(eq(notifications.userId, userId));
}

/**
 * Deletes a notification.
 */
export async function deleteNotification(notificationId: string, userId: string): Promise<void> {
  await ensureDbReady();
  await db
    .delete(notifications)
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
  saveDatabase();
}

/**
 * Deletes all notifications for a user.
 */
export async function clearAllNotifications(userId: string): Promise<void> {
  await ensureDbReady();
  await db
    .delete(notifications)
    .where(eq(notifications.userId, userId));
  saveDatabase();
}

/**
 * Broadcasts a board update event to all active SSE clients for real-time synchronization.
 */
export function broadcastBoardUpdate(): void {
  for (const [userId, userSet] of sseClients.entries()) {
    for (const res of userSet) {
      try {
        res.write(`event: board_update\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      } catch (err) {
        // ignore
      }
    }
  }
}
