import { User, BoardData, BoardColumn, SampleWhiteboard, SeedUser, Role, TaskComment, ManagerOption, ManagerAssignment } from './types';

const TOKEN_KEY = 'whiteboard_auth_token';

// In-memory fallback if localStorage access is denied in sandboxed iframe
const memoryStorage: Record<string, string> = {};

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return memoryStorage[TOKEN_KEY] || null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Fall back to memory storage in iframe
  }

  if (token) {
    memoryStorage[TOKEN_KEY] = token;
  } else {
    delete memoryStorage[TOKEN_KEY];
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const maxRetries = options.method && options.method !== 'GET' ? 0 : 2;
  let lastErr: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(endpoint, {
        ...options,
        headers,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401 && endpoint !== '/api/auth/login') {
          setToken(null);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('auth:expired', {
                detail: data.error || 'Invalid or expired session. Please log in again.',
              })
            );
          }
        }
        throw new Error(data.error || `Request failed with status ${response.status}`);
      }

      return data as T;
    } catch (err: any) {
      lastErr = err;
      const isNetworkErr = err.name === 'TypeError' || err.message?.includes('fetch') || err.message?.includes('Failed to fetch');
      if (attempt < maxRetries && isNetworkErr) {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }

  throw lastErr;
}

export const api = {
  // Auth
  async login(email: string, password: string): Promise<{ token: string; user: User }> {
    const res = await request<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(res.token);
    return res;
  },

  async reAuthenticateAdmin(): Promise<{ token: string; user: User }> {
    const res = await request<{ token: string; user: User }>('/api/auth/quick-switch', {
      method: 'POST',
      body: JSON.stringify({ role: 'admin' }),
    });
    setToken(res.token);
    return res;
  },

  async getMe(): Promise<{ user: User }> {
    return request<{ user: User }>('/api/auth/me');
  },

  async getSeedUsers(): Promise<{ seedUsers: SeedUser[] }> {
    return request<{ seedUsers: SeedUser[] }>('/api/auth/seed-users');
  },

  async quickSwitch(role: Role): Promise<{ token: string; user: User }> {
    const res = await request<{ token: string; user: User }>('/api/auth/quick-switch', {
      method: 'POST',
      body: JSON.stringify({ role }),
    });
    setToken(res.token);
    return res;
  },

  logout(): void {
    setToken(null);
  },

  // Board
  async getBoard(date?: string): Promise<BoardData> {
    const url = date ? `/api/board?date=${encodeURIComponent(date)}` : '/api/board';
    return request<BoardData>(url);
  },

  async seed15Days(date?: string): Promise<{ success: boolean; board: BoardData }> {
    return request<{ success: boolean; board: BoardData }>('/api/board/seed-15-days', {
      method: 'POST',
      body: JSON.stringify({ date }),
    });
  },

  async extractBoard(
    imageBase64: string,
    mimeType: string,
    signal?: AbortSignal
  ): Promise<{
    employees: Array<{
      name: string;
      originalExtractedName?: string;
      matchedName?: string;
      tasks: string[];
    }>;
    clarityScore?: string;
    autoMatchedCount?: number;
  }> {
    return request<{
      employees: Array<{
        name: string;
        originalExtractedName?: string;
        matchedName?: string;
        tasks: string[];
      }>;
      clarityScore?: string;
      autoMatchedCount?: number;
    }>('/api/board/extract', {
      method: 'POST',
      body: JSON.stringify({ imageBase64, mimeType }),
      signal,
    });
  },

  async publishBoard(
    employees: Array<{ name: string; tasks: string[] }>,
    date?: string
  ): Promise<{ success: boolean; board: BoardData }> {
    return request<{ success: boolean; board: BoardData }>('/api/board/publish', {
      method: 'POST',
      body: JSON.stringify({ employees, date }),
    });
  },

  async reorderBoard(columns: BoardColumn[], date?: string): Promise<{ success: boolean; board: BoardData }> {
    return request<{ success: boolean; board: BoardData }>('/api/board/reorder', {
      method: 'PUT',
      body: JSON.stringify({ columns, date }),
    });
  },

  async adminEditBoard(
    action: {
      type: 'rename_column' | 'add_column' | 'delete_column' | 'add_task' | 'edit_task' | 'delete_task' | 'delete_day_tasks';
      columnId?: string;
      taskId?: string;
      name?: string;
      text?: string;
      assignedDate?: string;
    },
    date?: string
  ): Promise<{ success: boolean; board: BoardData }> {
    return request<{ success: boolean; board: BoardData }>('/api/board/edit', {
      method: 'PUT',
      body: JSON.stringify({ action, date }),
    });
  },

  async addComment(taskId: string, content: string, date?: string): Promise<{ success: boolean; comment: TaskComment; board: BoardData }> {
    return request<{ success: boolean; comment: TaskComment; board: BoardData }>(
      `/api/tasks/${encodeURIComponent(taskId)}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ content, date }),
      }
    );
  },

  async deleteComment(taskId: string, commentId: string, date?: string): Promise<{ success: boolean; board: BoardData }> {
    const url = `/api/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(commentId)}${date ? `?date=${encodeURIComponent(date)}` : ''}`;
    return request<{ success: boolean; board: BoardData }>(
      url,
      {
        method: 'DELETE',
      }
    );
  },

  async toggleTaskComplete(
    taskId: string,
    completed?: boolean,
    date?: string,
    completedQuantity?: number,
    totalQuantity?: number
  ): Promise<{ success: boolean; board: BoardData }> {
    return request<{ success: boolean; board: BoardData }>(
      `/api/tasks/${encodeURIComponent(taskId)}/toggle-complete`,
      {
        method: 'PATCH',
        body: JSON.stringify({ completed, date, completedQuantity, totalQuantity }),
      }
    );
  },

  async approveTask(
    taskId: string,
    approved: boolean,
    date?: string
  ): Promise<{ success: boolean; board: BoardData }> {
    return request<{ success: boolean; board: BoardData }>(
      `/api/tasks/${encodeURIComponent(taskId)}/approve`,
      {
        method: 'PATCH',
        body: JSON.stringify({ approved, date }),
      }
    );
  },

  async getSampleWhiteboards(): Promise<{ samples: SampleWhiteboard[] }> {
    return request<{ samples: SampleWhiteboard[] }>('/api/sample-whiteboards');
  },

  // Manager Assignments (Admin Only)
  async getManagers(): Promise<{ managers: ManagerOption[] }> {
    return request<{ managers: ManagerOption[] }>('/api/admin/managers');
  },

  async getAssignments(): Promise<{ assignments: ManagerAssignment[] }> {
    return request<{ assignments: ManagerAssignment[] }>('/api/admin/assignments');
  },

  async assignEmployeeToManager(
    employeeName: string,
    managerId: string | null,
    columnId?: string
  ): Promise<{ success: boolean; board: BoardData }> {
    return request<{ success: boolean; board: BoardData }>('/api/admin/assign', {
      method: 'POST',
      body: JSON.stringify({ employeeName, managerId, columnId }),
    });
  },

  async bulkAssignEmployees(
    assignments: Array<{ employeeName: string; managerId?: string | null; managerIds?: string[] }>,
    date?: string
  ): Promise<{ success: boolean; board: BoardData }> {
    return request<{ success: boolean; board: BoardData }>('/api/admin/assign-bulk', {
      method: 'POST',
      body: JSON.stringify({ assignments, date }),
    });
  },

  // Team & User Management (Admin Only)
  async getUsers(): Promise<{ users: User[] }> {
    return request<{ users: User[] }>('/api/admin/users');
  },

  async createUser(data: {
    name: string;
    email: string;
    password: string;
    role: Role;
  }): Promise<{ success: boolean; user: User }> {
    return request<{ success: boolean; user: User }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateUser(
    userId: string,
    data: {
      name?: string;
      email?: string;
      role?: Role;
      password?: string;
      active?: boolean;
    }
  ): Promise<{ success: boolean; user: User }> {
    return request<{ success: boolean; user: User }>(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteUser(userId: string): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
  },

  // Role Management (Admin Only)
  async getRoles(): Promise<{ roles: import('./types').AppRole[] }> {
    return request<{ roles: import('./types').AppRole[] }>('/api/admin/roles');
  },

  async createRole(name: string, description?: string): Promise<{ success: boolean; role: import('./types').AppRole }> {
    return request<{ success: boolean; role: import('./types').AppRole }>('/api/admin/roles', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
  },

  async deleteRole(roleId: string): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>(`/api/admin/roles/${encodeURIComponent(roleId)}`, {
      method: 'DELETE',
    });
  },

  async getMonthlyReport(month?: string): Promise<{ success: boolean; report: import('./types').MonthlyReportResponse }> {
    const url = month ? `/api/reports/monthly?month=${encodeURIComponent(month)}` : '/api/reports/monthly';
    return request<{ success: boolean; report: import('./types').MonthlyReportResponse }>(url);
  },

  async updateColumnDepartment(columnId: string, department: string): Promise<{ success: boolean; board: BoardData }> {
    return request<{ success: boolean; board: BoardData }>(`/api/board/columns/${encodeURIComponent(columnId)}/department`, {
      method: 'PATCH',
      body: JSON.stringify({ department }),
    });
  },
};
