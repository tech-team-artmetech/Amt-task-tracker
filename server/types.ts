export type Role = 'admin' | 'manager' | 'Editors' | 'Designers' | 'Cinematographers' | 'member' | string;

export interface AppRole {
  id: string;
  name: string;
  description?: string;
  isSystem?: boolean;
  userCount?: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  pushEnabled?: boolean;
}

export interface TaskComment {
  id: string;
  taskId: string;
  userId: string;
  userName: string;
  userRole: Role;
  content: string;
  createdAt: string;
}

export interface BoardTask {
  id: string;
  columnId?: string;
  text: string;
  order: number;
  completed?: boolean;
  completedBy?: string | null;
  completedAt?: string | null;
  assignedDate?: string;
  isCarriedForward?: boolean;
  originalAssignedDate?: string;
  isGivenToday?: boolean;
  isP1?: boolean;
  comments?: TaskComment[];
  totalQuantity?: number;
  completedQuantity?: number;
  adminApproved?: boolean;
  adminApprovedBy?: string | null;
  adminApprovedAt?: string | null;
}

export interface BoardColumn {
  id: string;
  employeeName: string;
  department?: string;
  sortOrder: number;
  managerId?: string | null;
  managerName?: string | null;
  managerIds?: string[];
  managerNames?: string[];
  tasks: BoardTask[];
}

export interface DailyStats {
  date: string;
  totalTasks: number;
  totalGiven: number;
  totalCarriedForward: number;
  totalFinished: number;
  totalPending: number;
}

export interface AvailableDateInfo {
  date: string;
  label: string;
  dayOfWeek: string;
  totalTasks: number;
  givenCount: number;
  carriedCount: number;
  finishedCount: number;
  pendingCount: number;
}

export interface BoardData {
  columns: BoardColumn[];
  updatedAt: string | null;
  publishedBy: string | null;
  publishedByName?: string | null;
  selectedDate?: string;
  availableDates?: AvailableDateInfo[];
  dailyStats?: DailyStats;
  totalTeamColumnsCount?: number;
  isManagerFiltered?: boolean;
  departments?: string[];
}

export interface ManagerOption {
  id: string;
  name: string;
  email: string;
  assignedCount: number;
}

export interface ManagerAssignment {
  id: string;
  managerId: string;
  managerName: string;
  employeeName: string;
  createdAt: string;
}

export interface ExtractedTaskItem {
  text: string;
  completed?: boolean;
}

export interface GeminiEmployeeExtraction {
  name: string;
  department?: string;
  originalExtractedName?: string;
  matchedName?: string;
  tasks: (string | ExtractedTaskItem)[];
  parsedTasks?: ExtractedTaskItem[];
}

export interface GeminiExtractionResult {
  employees: GeminiEmployeeExtraction[];
  clarityScore?: string;
  unreadableReason?: string;
  autoMatchedCount?: number;
}

export interface AppNotification {
  id: string;
  userId: string;
  userEmail?: string | null;
  type: 'task_assigned' | 'task_completed';
  title: string;
  message: string;
  taskId?: string | null;
  taskText?: string | null;
  employeeName?: string | null;
  actorName?: string | null;
  isRead: boolean;
  createdAt: string;
}
