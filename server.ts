import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Keep the process alive on stray background rejections, but make them visible.
process.on('unhandledRejection', (reason: any) => {
  console.warn('[Server] Unhandled Rejection:', reason);
});

import {
  initDatabase,
  ensureDatabaseReady,
  getUserByEmail,
  getUserById,
  validateUserLogin,
  getBoard,
  addTasksToBoard,
  reorderBoard,
  adminEditBoard,
  addTaskComment,
  deleteTaskComment,
  toggleTaskCompleted,
  adminApproveTask,
  getManagers,
  getManagerAssignments,
  assignEmployeeToManager,
  bulkAssignEmployees,
  getAllUsers,
  createNewUser,
  updateUserDetails,
  deleteUserAccount,
  getRegisteredTeamMemberNames,
  updateUserPushPreference,
  getMonthlyEmployeeReport,
  updateColumnDepartment,
  getAllRoles,
  createAppRole,
  deleteAppRole,
} from './server/db.ts';
import { flushDatabaseSync } from './src/db/index.ts';
import {
  generateToken,
  authMiddleware,
  requireRole,
  assertAuthConfigured,
  type AuthenticatedRequest,
} from './server/auth.ts';
import type { User } from './server/types.ts';
import { extractBoardFromImage, extractBoardFromText } from './server/gemini.ts';
import {
  registerSSEClient,
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  clearAllNotifications,
  getVapidPublicKey,
  savePushSubscription,
  scheduleTestPush,
} from './server/notifications.ts';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);

async function startServer() {
  // Refuse to start in production without a real JWT secret.
  assertAuthConfigured();

  const app = express();

  // Behind a reverse proxy (Passenger / nginx) so req.ip and protocol are correct.
  app.set('trust proxy', 1);

  // Health check endpoint for uptime monitors / liveness probes
  app.get('/_healthz', (_req, res) => {
    res.status(200).send('OK');
  });

  // Support JSON bodies with sufficient limit for photo uploads
  app.use(express.json({ limit: '30mb' }));
  app.use(express.urlencoded({ extended: true, limit: '30mb' }));

  // ===================== AUTH ROUTES =====================

  // Basic brute-force protection: at most 10 failed logins per 15 minutes per IP + login id.
  const LOGIN_WINDOW_MS = 15 * 60 * 1000;
  const LOGIN_MAX_FAILURES = 10;
  const loginFailures = new Map<string, { count: number; resetAt: number }>();
  const loginKey = (req: express.Request) =>
    `${req.ip}|${String(req.body?.email || req.body?.identifier || '').trim().toLowerCase()}`;

  // POST /api/auth/login
  app.post('/api/auth/login', async (req, res) => {
    const key = loginKey(req);
    const now = Date.now();
    const entry = loginFailures.get(key);
    if (entry && entry.resetAt > now && entry.count >= LOGIN_MAX_FAILURES) {
      res.status(429).json({ error: 'Too many failed attempts. Please try again in 15 minutes.' });
      return;
    }
    if (entry && entry.resetAt <= now) loginFailures.delete(key);
    if (loginFailures.size > 5000) loginFailures.clear();

    const recordFailure = () => {
      const cur = loginFailures.get(key);
      if (cur && cur.resetAt > Date.now()) cur.count += 1;
      else loginFailures.set(key, { count: 1, resetAt: Date.now() + LOGIN_WINDOW_MS });
    };

    try {
      const email = req.body.email || req.body.identifier;
      const { password } = req.body;
      const { user, error } = await validateUserLogin(email, password);
      if (!user || error) {
        recordFailure();
        res.status(401).json({ error: 'Incorrect login Id or password' });
        return;
      }

      loginFailures.delete(key);
      const token = generateToken(user);
      res.json({ token, user });
    } catch (err: any) {
      console.error('[Auth Error during login]:', err?.message || err);
      recordFailure();
      res.status(401).json({ error: 'Incorrect login Id or password' });
    }
  });

  // GET /api/auth/me
  app.get('/api/auth/me', authMiddleware, (req: AuthenticatedRequest, res) => {
    res.json({ user: req.user });
  });

  // ===================== USER MANAGEMENT ROUTES (ADMIN ONLY) =====================

  // GET /api/admin/users: List all users
  app.get(
    '/api/admin/users',
    authMiddleware,
    requireRole(['admin']),
    async (_req: AuthenticatedRequest, res) => {
      try {
        const usersList = await getAllUsers();
        res.json({ users: usersList });
      } catch (err: any) {
        console.error('[Get Users Error]', err);
        res.status(500).json({ error: 'Failed to load users.' });
      }
    }
  );

  // POST /api/admin/users: Create new employee, manager, admin, or custom role user
  app.post(
    '/api/admin/users',
    authMiddleware,
    requireRole(['admin']),
    async (req: AuthenticatedRequest, res) => {
      try {
        const { name, email, password, role } = req.body;
        if (!name || !email || !password || !role) {
          res.status(400).json({ error: 'Name, email, password, and role are required.' });
          return;
        }

        const newUser = await createNewUser({
          name: String(name).trim(),
          email: String(email).trim(),
          password: String(password).trim(),
          role: String(role).trim(),
        });
        res.status(201).json({ success: true, user: newUser });
      } catch (err: any) {
        console.error('[Create User Error]', err);
        res.status(400).json({ error: err.message || 'Failed to create user.' });
      }
    }
  );

  // GET /api/admin/roles: List all roles (Admin only)
  app.get(
    '/api/admin/roles',
    authMiddleware,
    requireRole(['admin']),
    async (_req: AuthenticatedRequest, res) => {
      try {
        const rolesList = await getAllRoles();
        res.json({ roles: rolesList });
      } catch (err: any) {
        console.error('[Get Roles Error]', err);
        res.status(500).json({ error: 'Failed to load roles.' });
      }
    }
  );

  // POST /api/admin/roles: Create new role (Admin only)
  app.post(
    '/api/admin/roles',
    authMiddleware,
    requireRole(['admin']),
    async (req: AuthenticatedRequest, res) => {
      try {
        const { name, description } = req.body;
        if (!name || typeof name !== 'string' || !name.trim()) {
          res.status(400).json({ error: 'Role name is required.' });
          return;
        }

        const newRole = await createAppRole(name.trim(), description);
        res.status(201).json({ success: true, role: newRole });
      } catch (err: any) {
        console.error('[Create Role Error]', err);
        res.status(400).json({ error: err.message || 'Failed to create role.' });
      }
    }
  );

  // DELETE /api/admin/roles/:id: Delete custom role (Admin only)
  app.delete(
    '/api/admin/roles/:id',
    authMiddleware,
    requireRole(['admin']),
    async (req: AuthenticatedRequest, res) => {
      try {
        const { id } = req.params;
        await deleteAppRole(id);
        res.json({ success: true, message: 'Role deleted successfully.' });
      } catch (err: any) {
        console.error('[Delete Role Error]', err);
        res.status(400).json({ error: err.message || 'Failed to delete role.' });
      }
    }
  );

  // PUT /api/admin/users/:id: Update name, email, role, password, or active status
  app.put(
    '/api/admin/users/:id',
    authMiddleware,
    requireRole(['admin']),
    async (req: AuthenticatedRequest, res) => {
      try {
        const { id } = req.params;
        const { name, email, role, password, active } = req.body;
        const updated = await updateUserDetails(id, { name, email, role, password, active });
        res.json({ success: true, user: updated });
      } catch (err: any) {
        console.error('[Update User Error]', err);
        res.status(400).json({ error: err.message || 'Failed to update user.' });
      }
    }
  );

  // DELETE /api/admin/users/:id: Delete user
  app.delete(
    '/api/admin/users/:id',
    authMiddleware,
    requireRole(['admin']),
    async (req: AuthenticatedRequest, res) => {
      try {
        const { id } = req.params;
        if (req.user?.id === id) {
          res.status(400).json({ error: 'You cannot delete your own account while logged in.' });
          return;
        }
        await deleteUserAccount(id);
        res.json({ success: true, message: 'User deleted successfully.' });
      } catch (err: any) {
        console.error('[Delete User Error]', err);
        res.status(400).json({ error: err.message || 'Failed to delete user.' });
      }
    }
  );

  // ===================== MANAGER ASSIGNMENT ROUTES =====================

  // GET /api/admin/managers: List all managers (Admin & Manager)
  app.get(
    '/api/admin/managers',
    authMiddleware,
    requireRole(['admin', 'manager']),
    async (_req: AuthenticatedRequest, res) => {
      try {
        const managers = await getManagers();
        res.json({ managers });
      } catch (err: any) {
        console.error('[Get Managers Error]', err);
        res.status(500).json({ error: 'Failed to load managers.' });
      }
    }
  );

  // GET /api/admin/assignments: List current employee-to-manager assignments (Admin only)
  app.get(
    '/api/admin/assignments',
    authMiddleware,
    requireRole(['admin']),
    async (_req: AuthenticatedRequest, res) => {
      try {
        const assignments = await getManagerAssignments();
        res.json({ assignments });
      } catch (err: any) {
        console.error('[Get Assignments Error]', err);
        res.status(500).json({ error: 'Failed to load manager assignments.' });
      }
    }
  );

  // POST /api/admin/assign: Assign or unassign an employee to a manager (Admin only)
  app.post(
    '/api/admin/assign',
    authMiddleware,
    requireRole(['admin']),
    async (req: AuthenticatedRequest, res) => {
      try {
        const { employeeName, managerId, columnId, date } = req.body;
        if (!employeeName && !columnId) {
          res.status(400).json({ error: 'employeeName or columnId is required.' });
          return;
        }

        await assignEmployeeToManager(employeeName || '', managerId || null, columnId);
        const board = await getBoard(date, req.user);
        res.json({ success: true, board });
      } catch (err: any) {
        console.error('[Assign Manager Error]', err);
        res.status(500).json({ error: err.message || 'Failed to update manager assignment.' });
      }
    }
  );

  // POST /api/admin/assign-bulk: Bulk assign employees to managers (Admin only)
  app.post(
    '/api/admin/assign-bulk',
    authMiddleware,
    requireRole(['admin']),
    async (req: AuthenticatedRequest, res) => {
      try {
        const { assignments, date } = req.body;
        if (!Array.isArray(assignments)) {
          res.status(400).json({ error: 'assignments array is required.' });
          return;
        }

        await bulkAssignEmployees(assignments);
        const board = await getBoard(date, req.user);
        res.json({ success: true, board });
      } catch (err: any) {
        console.error('[Bulk Assign Error]', err);
        res.status(500).json({ error: err.message || 'Failed to update assignments.' });
      }
    }
  );

  // ===================== BOARD ROUTES =====================

  // GET /api/board: View current board or historical date (Admin, Manager, Employee)
  app.get('/api/board', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const date = req.query.date as string | undefined;
      const board = await getBoard(date, req.user);
      res.json(board);
    } catch (err: any) {
      console.error('[Get Board Error]', err);
      res.status(500).json({ error: 'Failed to retrieve board.' });
    }
  });

  // POST /api/board/extract: Send photo to Gemini Vision (Admin only)
  app.post(
    '/api/board/extract',
    authMiddleware,
    requireRole(['admin']),
    async (req: AuthenticatedRequest, res) => {
      try {
        const { imageBase64, mimeType } = req.body;
        if (!imageBase64) {
          res.status(400).json({ error: 'No whiteboard image provided.' });
          return;
        }

        const registeredNames = await getRegisteredTeamMemberNames();
        const result = await extractBoardFromImage(imageBase64, mimeType || 'image/jpeg', registeredNames);
        res.json(result);
      } catch (err: any) {
        console.error('[Vision Extract Error]', err);
        const msg = err.message || "Couldn't read the board, try a clearer photo";
        res.status(400).json({ error: msg });
      }
    }
  );

  // POST /api/board/extract-text: Send a pasted task list to Gemini (Admin only)
  app.post(
    '/api/board/extract-text',
    authMiddleware,
    requireRole(['admin']),
    async (req: AuthenticatedRequest, res) => {
      try {
        const { text } = req.body || {};
        if (typeof text !== 'string' || !text.trim()) {
          res.status(400).json({ error: 'No task list text provided.' });
          return;
        }

        const registeredNames = await getRegisteredTeamMemberNames();
        const result = await extractBoardFromText(text, registeredNames);
        res.json(result);
      } catch (err: any) {
        console.error('[Text Extract Error]', err);
        res.status(400).json({ error: err.message || "Couldn't read the pasted tasks, check the text and try again" });
      }
    }
  );

  // POST /api/board/publish: Confirm review and add the tasks to the board for the selected date (Admin only)
  app.post(
    '/api/board/publish',
    authMiddleware,
    requireRole(['admin']),
    async (req: AuthenticatedRequest, res) => {
      try {
        const { employees, date } = req.body;
        if (!Array.isArray(employees)) {
          res.status(400).json({ error: 'Employees array is required.' });
          return;
        }

        const newBoard = await addTasksToBoard(employees, req.user!.id, date);
        res.json({ success: true, board: newBoard });
      } catch (err: any) {
        console.error('[Publish Board Error]', err);
        res.status(500).json({ error: err.message || 'Failed to publish new board.' });
      }
    }
  );

  // PUT /api/board/reorder: Reorder tasks/columns (Admin & Manager)
  app.put(
    '/api/board/reorder',
    authMiddleware,
    requireRole(['admin', 'manager']),
    async (req: AuthenticatedRequest, res) => {
      try {
        const { columns, date } = req.body;
        if (!Array.isArray(columns)) {
          res.status(400).json({ error: 'Invalid columns payload.' });
          return;
        }

        const updatedBoard = await reorderBoard(columns, date, req.user);
        res.json({ success: true, board: updatedBoard });
      } catch (err: any) {
        console.error('[Reorder Board Error]', err);
        res.status(500).json({ error: 'Failed to update task ordering.' });
      }
    }
  );

  // PUT /api/board/edit: Admin, Manager, and Employee editing of tasks
  app.put(
    '/api/board/edit',
    authMiddleware,
    requireRole(['admin', 'manager', 'employee']),
    async (req: AuthenticatedRequest, res) => {
      try {
        const { action, date } = req.body;
        const act = action || req.body;
        if (!act || !act.type) {
          res.status(400).json({ error: 'Edit action type is required.' });
          return;
        }

        // Role permissions check on /api/board/edit:
        if (req.user?.role !== 'admin') {
          if (req.user?.role === 'manager') {
            if (!['add_task', 'edit_task'].includes(act.type)) {
              res.status(403).json({ error: 'Managers can only add and edit tasks.' });
              return;
            }
          } else {
            // Employees (and department roles) can add tasks for their own column
            if (act.type !== 'add_task') {
              res.status(403).json({ error: 'Employees can only add tasks for themselves.' });
              return;
            }
          }
        }

        const updatedBoard = await adminEditBoard(act, date, req.user);
        res.json({ success: true, board: updatedBoard });
      } catch (err: any) {
        console.error('[Board Edit Error]', err);
        res.status(500).json({ error: err.message || 'Failed to apply board edit.' });
      }
    }
  );

  // PATCH /api/board/columns/:columnId/department: Update column department (Admin & Manager allowed)
  app.patch(
    '/api/board/columns/:columnId/department',
    authMiddleware,
    requireRole(['admin', 'manager']),
    async (req: AuthenticatedRequest, res) => {
      try {
        const { columnId } = req.params;
        const { department } = req.body;
        const updatedBoard = await updateColumnDepartment(columnId, department, req.user);
        res.json({ success: true, board: updatedBoard });
      } catch (err: any) {
        console.error('[Update Department Error]', err);
        res.status(500).json({ error: 'Failed to update column department.' });
      }
    }
  );

  // POST /api/tasks/:taskId/comments: Add comment (All active team members allowed)
  app.post(
    '/api/tasks/:taskId/comments',
    authMiddleware,
    async (req: AuthenticatedRequest, res) => {
      try {
        const { taskId } = req.params;
        const { content, date } = req.body;
        if (!content || typeof content !== 'string' || !content.trim()) {
          res.status(400).json({ error: 'Comment content cannot be empty.' });
          return;
        }

        const result = await addTaskComment(taskId, req.user!, content, date);
        res.json({ success: true, ...result });
      } catch (err: any) {
        console.error('[Add Comment Error]', err);
        res.status(500).json({ error: err.message || 'Failed to add comment.' });
      }
    }
  );

  // DELETE /api/tasks/:taskId/comments/:commentId: Delete comment (Author or Admin/Manager allowed)
  app.delete(
    '/api/tasks/:taskId/comments/:commentId',
    authMiddleware,
    async (req: AuthenticatedRequest, res) => {
      try {
        const { commentId } = req.params;
        const date = (req.query?.date as string) || req.body?.date || undefined;
        const updatedBoard = await deleteTaskComment(commentId, req.user!, date);
        res.json({ success: true, board: updatedBoard });
      } catch (err: any) {
        console.error('[Delete Comment Error]', err);
        res.status(500).json({ error: err.message || 'Failed to delete comment.' });
      }
    }
  );

  // PATCH /api/tasks/:taskId/toggle-complete: Mark task finished/completed (All active team members allowed)
  app.patch(
    '/api/tasks/:taskId/toggle-complete',
    authMiddleware,
    async (req: AuthenticatedRequest, res) => {
      try {
        const { taskId } = req.params;
        const { completed, date, completedQuantity, totalQuantity } = req.body || {};
        const updatedBoard = await toggleTaskCompleted(
          taskId,
          req.user!,
          typeof completed === 'boolean' ? completed : undefined,
          date,
          typeof completedQuantity === 'number' ? completedQuantity : undefined,
          typeof totalQuantity === 'number' ? totalQuantity : undefined
        );
        res.json({ success: true, board: updatedBoard });
      } catch (err: any) {
        console.error('[Toggle Task Complete Error]', err);
        res.status(500).json({ error: err.message || 'Failed to update task completion.' });
      }
    }
  );

  // PATCH /api/tasks/:taskId/approve: Admin approves or unapproves a task
  app.patch(
    '/api/tasks/:taskId/approve',
    authMiddleware,
    requireRole(['admin']),
    async (req: AuthenticatedRequest, res) => {
      try {
        const { taskId } = req.params;
        const { approved = true, date } = req.body || {};
        const approvingUser: User = req.user!;
        const updatedBoard = await adminApproveTask(
          taskId,
          Boolean(approved),
          date,
          approvingUser
        );
        res.json({ success: true, board: updatedBoard });
      } catch (err: any) {
        console.error('[Admin Approve Task Error]', err);
        res.status(500).json({ error: err.message || 'Failed to approve task.' });
      }
    }
  );

  // ===================== NOTIFICATION ROUTES =====================

  // GET /api/notifications: Fetch current user's notifications and unread count
  app.get('/api/notifications', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const data = await getUserNotifications(req.user!.id);
      res.json(data);
    } catch (err: any) {
      console.error('[Get Notifications Error]', err);
      res.status(500).json({ error: 'Failed to retrieve notifications.' });
    }
  });

  // GET /api/notifications/stream: Server-Sent Events (SSE) for live push notifications
  app.get('/api/notifications/stream', authMiddleware, (req: AuthenticatedRequest, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Content-Encoding', 'none');
    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    }

    const cleanup = registerSSEClient(req.user!.id, res);
    req.on('close', () => {
      cleanup();
    });
  });

  // PATCH /api/notifications/:id/read: Mark single notification as read
  app.patch('/api/notifications/:id/read', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      await markNotificationAsRead(id, req.user!.id);
      res.json({ success: true });
    } catch (err: any) {
      console.error('[Mark Notification Read Error]', err);
      res.status(500).json({ error: 'Failed to mark notification as read.' });
    }
  });

  // POST /api/notifications/mark-all-read: Mark all notifications as read for current user
  app.post('/api/notifications/mark-all-read', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      await markAllNotificationsAsRead(req.user!.id);
      res.json({ success: true });
    } catch (err: any) {
      console.error('[Mark All Read Error]', err);
      res.status(500).json({ error: 'Failed to mark all as read.' });
    }
  });

  // DELETE /api/notifications: Clear all notifications for current user
  app.delete('/api/notifications', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      await clearAllNotifications(req.user!.id);
      res.json({ success: true });
    } catch (err: any) {
      console.error('[Clear All Notifications Error]', err);
      res.status(500).json({ error: 'Failed to clear all notifications.' });
    }
  });

  // DELETE /api/notifications/:id: Dismiss a notification
  app.delete('/api/notifications/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      await deleteNotification(id, req.user!.id);
      res.json({ success: true });
    } catch (err: any) {
      console.error('[Delete Notification Error]', err);
      res.status(500).json({ error: 'Failed to delete notification.' });
    }
  });

  // GET /api/user/push-preferences: Check if push is enabled for user account
  app.get('/api/user/push-preferences', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const user = await getUserById(req.user!.id);
      res.json({ pushEnabled: Boolean(user?.pushEnabled) });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to get push preferences.' });
    }
  });

  // POST /api/user/push-preferences: Enable or disable push on user account
  app.post('/api/user/push-preferences', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const { pushEnabled } = req.body;
      const enabled = Boolean(pushEnabled);
      await updateUserPushPreference(req.user!.id, enabled);
      res.json({ success: true, pushEnabled: enabled });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to update push preferences.' });
    }
  });

  // GET /api/notifications/vapid-public-key: Public key for browser PushManager subscription
  app.get('/api/notifications/vapid-public-key', authMiddleware, (_req: AuthenticatedRequest, res) => {
    res.json({ publicKey: getVapidPublicKey() });
  });

  // POST /api/notifications/subscribe: Register browser service worker push subscription
  app.post('/api/notifications/subscribe', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const { subscription } = req.body;
      if (!subscription || !subscription.endpoint) {
        res.status(400).json({ error: 'Valid push subscription object is required.' });
        return;
      }
      const saved = await savePushSubscription(req.user!.id, subscription);
      if (!saved) {
        res.status(400).json({
          error: 'Invalid push subscription keys. The subscription p256dh value must be 65 bytes long.',
        });
        return;
      }
      res.json({ success: true, message: 'Push subscription registered.' });
    } catch (err: any) {
      console.error('[Push Subscribe Error]', err);
      res.status(500).json({ error: 'Failed to save push subscription.' });
    }
  });

  // POST /api/notifications/test-push: Sends a background push after N seconds so user can close tab to test
  app.post('/api/notifications/test-push', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const delay = Math.max(1, parseInt(req.body.delaySeconds || '3', 10));
      scheduleTestPush(req.user!.id, delay);
      res.json({
        success: true,
        message: `Background push scheduled in ${delay} seconds. Minimize or close this tab now to see it popup!`,
      });
    } catch (err: any) {
      console.error('[Test Push Error]', err);
      res.status(500).json({ error: 'Failed to schedule test push.' });
    }
  });

  // Dedicated Service Worker route with proper MIME type, service worker headers, and no cache
  app.get('/sw.js', (_req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const swPath = path.join(process.cwd(), 'public', 'sw.js');
    res.sendFile(swPath);
  });

  // GET /api/reports/monthly: Monthly carry-forwards and changes report (Strictly Admin only)
  app.get(
    '/api/reports/monthly',
    authMiddleware,
    requireRole(['admin']),
    async (req: AuthenticatedRequest, res) => {
      try {
        const month = req.query.month as string | undefined;
        const report = await getMonthlyEmployeeReport(month, req.user);
        res.json({ success: true, report });
      } catch (err: any) {
        console.error('[Monthly Report Error]', err);
        res.status(500).json({ error: 'Failed to generate monthly employee report.' });
      }
    }
  );

  // ===================== FRONTEND SERVING =====================

  if (process.env.NODE_ENV !== 'production') {
    // Loaded only in development so the production server doesn't need Vite installed.
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // The built server lives in <app>/dist/server.cjs, next to the built frontend.
    const bundledDir = typeof __dirname !== 'undefined' ? __dirname : '';
    const distPath =
      bundledDir && fs.existsSync(path.join(bundledDir, 'index.html'))
        ? bundledDir
        : path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'Not found.' });
        return;
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Make sure the database is ready (and saved on disk) before taking traffic.
  await initDatabase();

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Office Whiteboard Mirror listening on http://0.0.0.0:${PORT}`);
  });

  // Final synchronous save when the host stops or restarts the app.
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Server] ${signal} received, saving database and shutting down.`);
    try {
      flushDatabaseSync();
    } catch (err) {
      console.error('[Server] Final database save failed:', err);
    }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('[Fatal Server Startup Error]:', err);
  process.exit(1);
});
