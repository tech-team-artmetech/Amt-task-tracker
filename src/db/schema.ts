import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  uid: text('uid').unique(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  role: text('role').notNull().default('employee'),
  active: integer('active').notNull().default(1),
  pushNotificationsEnabled: integer('push_notifications_enabled').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

export const boardMeta = sqliteTable('board_meta', {
  id: integer('id').primaryKey(),
  updatedAt: text('updated_at').notNull(),
  publishedBy: text('published_by').notNull(),
});

export const boardColumns = sqliteTable('board_columns', {
  id: text('id').primaryKey(),
  employeeName: text('employee_name').notNull(),
  department: text('department').default('General'),
  sortOrder: integer('sort_order').notNull(),
  managerId: text('manager_id'),
  managerName: text('manager_name'),
  deletedFromDate: text('deleted_from_date'),
});

export const boardTasks = sqliteTable('board_tasks', {
  id: text('id').primaryKey(),
  columnId: text('column_id')
    .notNull()
    .references(() => boardColumns.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  sortOrder: integer('sort_order').notNull(),
  completed: integer('completed').default(0),
  completedBy: text('completed_by'),
  completedAt: text('completed_at'),
  assignedDate: text('assigned_date'),
  totalQuantity: integer('total_quantity').default(1),
  completedQuantity: integer('completed_quantity').default(0),
  adminApproved: integer('admin_approved').default(0),
  adminApprovedBy: text('admin_approved_by'),
  adminApprovedAt: text('admin_approved_at'),
});

export const taskComments = sqliteTable('task_comments', {
  id: text('id').primaryKey(),
  taskId: text('task_id')
    .notNull()
    .references(() => boardTasks.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  userName: text('user_name').notNull(),
  userRole: text('user_role').notNull(),
  content: text('content').notNull(),
  createdAt: text('created_at').notNull(),
});

export const managerAssignments = sqliteTable('manager_assignments', {
  id: text('id').primaryKey(),
  managerId: text('manager_id').notNull(),
  managerName: text('manager_name').notNull(),
  employeeName: text('employee_name').notNull(),
  createdAt: text('created_at').notNull(),
});

export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  userEmail: text('user_email'),
  type: text('type').notNull(), // 'task_assigned' | 'task_completed'
  title: text('title').notNull(),
  message: text('message').notNull(),
  taskId: text('task_id'),
  taskText: text('task_text'),
  employeeName: text('employee_name'),
  actorName: text('actor_name'),
  isRead: integer('is_read').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  endpoint: text('endpoint').notNull().unique(),
  subscriptionJson: text('subscription_json').notNull(),
  createdAt: text('created_at').notNull(),
});

export const columnDateExclusions = sqliteTable('column_date_exclusions', {
  id: text('id').primaryKey(),
  columnId: text('column_id').notNull(),
  excludedDate: text('excluded_date').notNull(),
});

export const appRoles = sqliteTable('app_roles', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  isSystem: integer('is_system').default(0),
  createdAt: text('created_at').notNull(),
});

export const boardColumnsRelations = relations(boardColumns, ({ many }) => ({
  tasks: many(boardTasks),
}));

export const boardTasksRelations = relations(boardTasks, ({ one, many }) => ({
  column: one(boardColumns, {
    fields: [boardTasks.columnId],
    references: [boardColumns.id],
  }),
  comments: many(taskComments),
}));

export const taskCommentsRelations = relations(taskComments, ({ one }) => ({
  task: one(boardTasks, {
    fields: [taskComments.taskId],
    references: [boardTasks.id],
  }),
}));
