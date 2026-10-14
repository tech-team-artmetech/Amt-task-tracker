import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Key,
  Shield,
  Trash2,
  Edit2,
  Check,
  X,
  AlertCircle,
  Eye,
  EyeOff,
  UserCheck,
  UserX,
  Tag,
  Plus,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { api } from '../api';
import { User, Role, AppRole } from '../types';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  onUserUpdated?: (user: User) => void;
  onTeamChanged?: () => void;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onToast,
  onUserUpdated,
  onTeamChanged,
}) => {
  const [activeTab, setActiveTab] = useState<'accounts' | 'roles'>('accounts');
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New User Form State
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<Role>('Editors');
  const [isSaving, setIsSaving] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Editing User State
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<Role>('Editors');
  const [editPassword, setEditPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);

  // New Role Form State (Tab)
  const [isAddingRole, setIsAddingRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [isSavingRole, setIsSavingRole] = useState(false);

  // Quick Role Creation Modal State (Accessible from anywhere)
  const [isQuickCreateRoleOpen, setIsQuickCreateRoleOpen] = useState(false);
  const [quickRoleTarget, setQuickRoleTarget] = useState<'create' | 'edit' | 'general'>('general');
  const [quickRoleName, setQuickRoleName] = useState('');
  const [quickRoleDesc, setQuickRoleDesc] = useState('');
  const [isSavingQuickRole, setIsSavingQuickRole] = useState(false);

  // In-app Deletion Confirmation Dialog States (Replaces window.confirm for iframe compatibility)
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<AppRole | null>(null);
  const [isExecutingDelete, setIsExecutingDelete] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        api.getUsers(),
        api.getRoles(),
      ]);
      setUsers(usersRes.users || []);
      setRoles(rolesRes.roles || []);
      if (rolesRes.roles && rolesRes.roles.length > 0) {
        if (!newRole) {
          setNewRole(rolesRes.roles[0].name);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load team members and roles.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim() || !newPassword.trim()) {
      setError('Name, email, and password are required.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const res = await api.createUser({
        name: newName.trim(),
        email: newEmail.trim().toLowerCase(),
        password: newPassword.trim(),
        role: newRole,
      });

      setUsers((prev) => [...prev, res.user].sort((a, b) => a.name.localeCompare(b.name)));
      setIsAddingUser(false);
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('employee');
      onToast(`Account created for ${res.user.name} (${res.user.role})`, 'success');
      onUserUpdated?.(res.user);
      onTeamChanged?.();
      // Refresh roles to update user counts
      const rolesRes = await api.getRoles();
      if (rolesRes?.roles) {
        setRoles(rolesRes.roles);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create user account.');
    } finally {
      setIsSaving(false);
    }
  };

  const startEdit = (u: User) => {
    setEditingUserId(u.id);
    setEditName(u.name);
    setEditEmail(u.email);
    setEditRole(u.role);
    setEditPassword('');
    setShowEditPassword(false);
  };

  const cancelEdit = () => {
    setEditingUserId(null);
    setEditName('');
    setEditEmail('');
    setEditRole('employee');
    setEditPassword('');
  };

  const handleSaveEdit = async (userId: string) => {
    setIsSaving(true);
    setError(null);
    try {
      const payload: any = {
        name: editName.trim(),
        email: editEmail.trim().toLowerCase(),
        role: editRole,
      };
      if (editPassword.trim()) {
        payload.password = editPassword.trim();
      }

      const res = await api.updateUser(userId, payload);
      setUsers((prev) => prev.map((u) => (u.id === userId ? res.user : u)));
      setEditingUserId(null);
      onToast(`Account and role updated for ${res.user.name} to "${res.user.role}"`, 'success');
      onUserUpdated?.(res.user);
      onTeamChanged?.();
      // Refresh roles to update user counts
      const rolesRes = await api.getRoles();
      if (rolesRes?.roles) {
        setRoles(rolesRes.roles);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update user.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (u: User) => {
    if (u.id === currentUser.id) {
      onToast('You cannot deactivate your own active account.', 'error');
      return;
    }

    try {
      const nextActive = !u.active;
      const res = await api.updateUser(u.id, { active: nextActive });
      setUsers((prev) => prev.map((item) => (item.id === u.id ? res.user : item)));
      onToast(
        nextActive ? `Account activated for ${u.name}` : `Account suspended for ${u.name}`,
        'info'
      );
      onTeamChanged?.();
    } catch (err: any) {
      onToast(err.message || 'Failed to change account status', 'error');
    }
  };

  const handleDeleteUser = (u: User) => {
    if (u.id === currentUser.id) {
      onToast('You cannot delete your own account.', 'error');
      return;
    }
    setUserToDelete(u);
  };

  const executeDeleteUser = async () => {
    if (!userToDelete) return;
    setIsExecutingDelete(true);
    try {
      await api.deleteUser(userToDelete.id);
      setUsers((prev) => prev.filter((item) => item.id !== userToDelete.id));
      onToast(`User ${userToDelete.name} deleted successfully.`, 'success');
      onTeamChanged?.();
      const rolesRes = await api.getRoles();
      if (rolesRes?.roles) {
        setRoles(rolesRes.roles);
      }
      setUserToDelete(null);
    } catch (err: any) {
      onToast(err.message || 'Failed to delete user.', 'error');
    } finally {
      setIsExecutingDelete(false);
    }
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newRoleName.trim();
    if (!cleanName) {
      setError('Role name cannot be empty.');
      return;
    }

    setIsSavingRole(true);
    setError(null);
    try {
      const res = await api.createRole(cleanName, newRoleDesc.trim());
      setRoles((prev) => {
        const updated = [...prev, res.role];
        return updated.sort((a, b) => a.name.localeCompare(b.name));
      });
      setNewRole(cleanName);
      if (editingUserId) {
        setEditRole(cleanName);
      }
      setNewRoleName('');
      setNewRoleDesc('');
      setIsAddingRole(false);
      onToast(`New role "${cleanName}" created successfully!`, 'success');
      onTeamChanged?.();
    } catch (err: any) {
      setError(err.message || 'Failed to create new role.');
    } finally {
      setIsSavingRole(false);
    }
  };

  const handleQuickCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = quickRoleName.trim();
    if (!cleanName) {
      setError('Role name cannot be empty.');
      return;
    }

    setIsSavingQuickRole(true);
    setError(null);
    try {
      const res = await api.createRole(cleanName, quickRoleDesc.trim());
      setRoles((prev) => {
        const updated = [...prev, res.role];
        return updated.sort((a, b) => a.name.localeCompare(b.name));
      });
      if (quickRoleTarget === 'edit') {
        setEditRole(cleanName);
      } else if (quickRoleTarget === 'create') {
        setNewRole(cleanName);
      }
      setQuickRoleName('');
      setQuickRoleDesc('');
      setIsQuickCreateRoleOpen(false);
      onToast(`New role "${cleanName}" created and selected!`, 'success');
      onTeamChanged?.();
    } catch (err: any) {
      setError(err.message || 'Failed to create role.');
    } finally {
      setIsSavingQuickRole(false);
    }
  };

  const handleDeleteRole = (role: AppRole) => {
    if (role.isSystem || ['admin', 'manager', 'employee'].includes(role.name.toLowerCase())) {
      onToast(`Cannot delete default system role "${role.name}".`, 'error');
      return;
    }
    setRoleToDelete(role);
  };

  const executeDeleteRole = async () => {
    if (!roleToDelete) return;
    setIsExecutingDelete(true);
    try {
      await api.deleteRole(roleToDelete.id);
      setRoles((prev) => prev.filter((r) => r.id !== roleToDelete.id));
      const usersRes = await api.getUsers();
      setUsers(usersRes.users || []);
      onToast(`Role "${roleToDelete.name}" removed successfully.`, 'success');
      onTeamChanged?.();
      setRoleToDelete(null);
    } catch (err: any) {
      onToast(err.message || 'Failed to delete role.', 'error');
    } finally {
      setIsExecutingDelete(false);
    }
  };

  const getRoleBadgeClasses = (roleName: string) => {
    const presetMap: Record<string, string> = {
      admin: 'bg-indigo-950/80 text-indigo-300 border-indigo-500/40',
      manager: 'bg-amber-950/80 text-amber-300 border-amber-500/40',
      Editors: 'bg-blue-950/80 text-blue-300 border-blue-500/40',
      Designers: 'bg-purple-950/80 text-purple-300 border-purple-500/40',
      Cinematographers: 'bg-rose-950/80 text-rose-300 border-rose-500/40',
      employee: 'bg-slate-800 text-slate-300 border-slate-700',
    };

    if (presetMap[roleName]) {
      return presetMap[roleName];
    }

    // Dynamic palette for custom roles
    const colors = [
      'bg-teal-950/80 text-teal-300 border-teal-500/40',
      'bg-cyan-950/80 text-cyan-300 border-cyan-500/40',
      'bg-emerald-950/80 text-emerald-300 border-emerald-500/40',
      'bg-fuchsia-950/80 text-fuchsia-300 border-fuchsia-500/40',
      'bg-orange-950/80 text-orange-300 border-orange-500/40',
    ];
    let hash = 0;
    for (let i = 0; i < roleName.length; i++) {
      hash = roleName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  // Fallback roles if list not loaded yet
  const availableRoleNames = roles.length > 0
    ? roles.map((r) => r.name)
    : ['admin', 'manager', 'Editors', 'Designers', 'Cinematographers', 'employee'];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto">
      <div className="bg-[#0e1126] border border-white/10 rounded-2xl w-full max-w-3xl shadow-2xl text-white overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between shrink-0 bg-[#0B0B1E]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#2E2BE6] text-white flex items-center justify-center shadow-md">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-base text-white">Team & Role Management</h2>
              <p className="text-xs text-slate-400">
                Manage accounts, assign roles, and create new department roles
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-4 pt-3 pb-1 border-b border-white/10 flex items-center gap-2 bg-[#0d1024] shrink-0">
          <button
            type="button"
            id="tab-accounts"
            onClick={() => {
              setActiveTab('accounts');
              setError(null);
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'accounts'
                ? 'bg-[#2E2BE6] text-white shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Team Accounts ({users.length})</span>
          </button>
          <button
            type="button"
            id="tab-roles"
            onClick={() => {
              setActiveTab('roles');
              setError(null);
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'roles'
                ? 'bg-[#2E2BE6] text-white shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Roles & Departments ({roles.length})</span>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              id="btn-header-quick-create-role"
              onClick={() => {
                setQuickRoleTarget('general');
                setQuickRoleName('');
                setQuickRoleDesc('');
                setIsQuickCreateRoleOpen(true);
                setError(null);
              }}
              className="px-3 py-1.5 rounded-lg bg-indigo-600/90 hover:bg-indigo-600 text-white text-xs font-semibold flex items-center gap-1.5 shadow transition-all cursor-pointer"
              title="Create a new role / department"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
              <span>+ Create Role</span>
            </button>
          </div>
        </div>

        {/* Action / Error Banner */}
        {error && (
          <div className="m-4 p-3 bg-rose-950/60 border border-rose-500/50 rounded-xl text-rose-200 text-xs flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-5">
          {activeTab === 'roles' ? (
            /* ================= ROLE MANAGEMENT TAB ================= */
            <div className="space-y-4">
              {/* Create New Role Card / Form */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                {!isAddingRole ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-xs text-white flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Create Custom Role</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Add a new team role or department (e.g. Animators, QA, Script Writers)
                      </div>
                    </div>
                    <button
                      id="btn-open-add-role"
                      onClick={() => setIsAddingRole(true)}
                      className="px-3.5 py-1.5 rounded-lg bg-[#2E2BE6] hover:bg-[#221fd4] text-white text-xs font-semibold flex items-center gap-1.5 shadow transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Create New Role</span>
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleCreateRole} className="space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-white/10">
                      <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-indigo-400" />
                        <span>New Role Details</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingRole(false);
                          setError(null);
                        }}
                        className="text-xs text-slate-400 hover:text-white cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1">
                          Role / Department Name *
                        </label>
                        <input
                          id="input-new-role-name"
                          type="text"
                          required
                          value={newRoleName}
                          onChange={(e) => setNewRoleName(e.target.value)}
                          placeholder="e.g. Animators or Quality Assurance"
                          className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1">
                          Description (Optional)
                        </label>
                        <input
                          id="input-new-role-desc"
                          type="text"
                          value={newRoleDesc}
                          onChange={(e) => setNewRoleDesc(e.target.value)}
                          placeholder="Brief role responsibilities"
                          className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setIsAddingRole(false)}
                        className="px-3 py-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        id="btn-submit-new-role"
                        type="submit"
                        disabled={isSavingRole}
                        className="px-4 py-1.5 rounded-lg bg-[#2E2BE6] hover:bg-[#221fd4] text-white text-xs font-semibold shadow disabled:opacity-50 cursor-pointer"
                      >
                        {isSavingRole ? 'Saving Role...' : 'Save Role'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Roles List */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Available System & Department Roles ({roles.length})
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Assigned to team members and reflected on taskboard
                  </span>
                </div>

                <div className="border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5 bg-black/20">
                  {roles.map((r) => {
                    const isSystemRole = r.isSystem || ['admin', 'manager', 'employee'].includes(r.name.toLowerCase());
                    return (
                      <div
                        key={r.id}
                        className="p-3 sm:p-3.5 flex items-center justify-between gap-3 hover:bg-white/[0.02] transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`text-xs px-2.5 py-1 rounded-full border font-bold uppercase tracking-wider ${getRoleBadgeClasses(
                              r.name
                            )}`}
                          >
                            {r.name}
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs text-slate-300 font-medium">
                              {r.description || (r.name === 'admin' ? 'Administrator' : r.name === 'manager' ? 'Manager' : `${r.name} Team`)}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {r.userCount || 0} user account{r.userCount === 1 ? '' : 's'} assigned
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isSystemRole ? (
                            <span className="text-[10px] text-slate-500 font-medium px-2 py-0.5 rounded bg-white/5 border border-white/5">
                              System Core
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDeleteRole(r)}
                              title={`Delete custom role "${r.name}"`}
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* ================= ACCOUNTS MANAGEMENT TAB ================= */
            <>
              {/* Add New User Toggle / Form */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                {!isAddingUser ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-xs text-white">Add New Team Member</div>
                      <div className="text-[11px] text-slate-400">
                        Create credentials for a Team Member, Manager, or Admin
                      </div>
                    </div>
                    <button
                      id="btn-open-add-user"
                      onClick={() => setIsAddingUser(true)}
                      className="px-3.5 py-1.5 rounded-lg bg-[#2E2BE6] hover:bg-[#221fd4] text-white text-xs font-semibold flex items-center gap-1.5 shadow transition-all cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Add Member</span>
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleCreateUser} className="space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-white/10">
                      <span className="text-xs font-bold text-white uppercase tracking-wider">
                        New Account Details
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingUser(false);
                          setError(null);
                        }}
                        className="text-xs text-slate-400 hover:text-white cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1">
                          Full Name *
                        </label>
                        <input
                          id="input-create-name"
                          type="text"
                          required
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder="e.g. Rachel Green"
                          className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1">
                          Email Address *
                        </label>
                        <input
                          id="input-create-email"
                          type="email"
                          required
                          value={newEmail}
                          onChange={(e) => setNewEmail(e.target.value)}
                          placeholder="employee@artmetech.in"
                          className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1">
                          Login Password *
                        </label>
                        <div className="relative">
                          <input
                            id="input-create-password"
                            type={showNewPassword ? 'text' : 'password'}
                            required
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="At least 6 characters"
                            className="w-full pl-3 pr-9 py-2 bg-black/40 border border-white/15 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute right-2.5 top-2 text-slate-400 hover:text-white cursor-pointer"
                          >
                            {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] font-bold text-slate-300 uppercase">
                            Server Role *
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setQuickRoleTarget('create');
                              setQuickRoleName('');
                              setQuickRoleDesc('');
                              setIsQuickCreateRoleOpen(true);
                            }}
                            className="text-[10px] text-indigo-400 hover:text-indigo-300 underline font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" /> Create New Role
                          </button>
                        </div>
                        <select
                          id="select-create-role"
                          value={newRole}
                          onChange={(e) => {
                            if (e.target.value === '__CREATE_NEW_ROLE__') {
                              setQuickRoleTarget('create');
                              setQuickRoleName('');
                              setQuickRoleDesc('');
                              setIsQuickCreateRoleOpen(true);
                              return;
                            }
                            setNewRole(e.target.value as Role);
                          }}
                          className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        >
                          {availableRoleNames.map((rName) => (
                            <option key={rName} value={rName} className="bg-[#0e1126] text-white">
                              {rName}
                              {rName === 'manager' ? ' (Manager)' : rName === 'admin' ? ' (Admin)' : ''}
                            </option>
                          ))}
                          <option value="__CREATE_NEW_ROLE__" className="bg-[#1c224b] text-indigo-300 font-bold">
                            + Create New Role...
                          </option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setIsAddingUser(false)}
                        className="px-3 py-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        id="btn-submit-new-user"
                        type="submit"
                        disabled={isSaving}
                        className="px-4 py-1.5 rounded-lg bg-[#2E2BE6] hover:bg-[#221fd4] text-white text-xs font-semibold shadow disabled:opacity-50 cursor-pointer"
                      >
                        {isSaving ? 'Creating...' : 'Create Account'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* User List */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Existing Accounts ({users.length})
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Server-enforced roles and permissions
                  </span>
                </div>

                {isLoading ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    Loading team members and roles from database...
                  </div>
                ) : users.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">No users found.</div>
                ) : (
                  <div className="border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5 bg-black/20">
                    {users.map((u) => {
                      const isEditing = editingUserId === u.id;
                      const isSelf = currentUser.id === u.id;
                      const badgeClass = getRoleBadgeClasses(u.role);

                      if (isEditing) {
                        return (
                          <div key={u.id} className="p-3 bg-white/5 space-y-3">
                            <div className="flex items-center justify-between text-xs font-bold text-indigo-300">
                              <span>Editing {u.name}</span>
                              <button onClick={cancelEdit} className="text-slate-400 hover:text-white cursor-pointer">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              <div>
                                <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">
                                  Name
                                </label>
                                <input
                                  id={`input-edit-name-${u.id}`}
                                  type="text"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  className="w-full px-2.5 py-1.5 bg-black/40 border border-white/15 rounded text-xs text-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">
                                  Email
                                </label>
                                <input
                                  id={`input-edit-email-${u.id}`}
                                  type="email"
                                  value={editEmail}
                                  onChange={(e) => setEditEmail(e.target.value)}
                                  className="w-full px-2.5 py-1.5 bg-black/40 border border-white/15 rounded text-xs text-white"
                                />
                              </div>
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-[10px] text-slate-400 font-bold uppercase">
                                    Role
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setQuickRoleTarget('edit');
                                      setQuickRoleName('');
                                      setQuickRoleDesc('');
                                      setIsQuickCreateRoleOpen(true);
                                    }}
                                    className="text-[10px] text-indigo-400 hover:text-indigo-300 underline font-semibold flex items-center gap-1 cursor-pointer"
                                  >
                                    <Plus className="w-3 h-3" /> Create New Role
                                  </button>
                                </div>
                                <select
                                  id={`select-edit-role-${u.id}`}
                                  value={editRole}
                                  onChange={(e) => {
                                    if (e.target.value === '__CREATE_NEW_ROLE__') {
                                      setQuickRoleTarget('edit');
                                      setQuickRoleName('');
                                      setQuickRoleDesc('');
                                      setIsQuickCreateRoleOpen(true);
                                      return;
                                    }
                                    setEditRole(e.target.value as Role);
                                  }}
                                  className="w-full px-2.5 py-1.5 bg-black/40 border border-white/15 rounded text-xs text-white cursor-pointer"
                                >
                                  {availableRoleNames.map((rName) => (
                                    <option key={rName} value={rName} className="bg-[#0e1126] text-white">
                                      {rName}
                                      {rName === 'manager' ? ' (Manager)' : rName === 'admin' ? ' (Admin)' : ''}
                                    </option>
                                  ))}
                                  <option value="__CREATE_NEW_ROLE__" className="bg-[#1c224b] text-indigo-300 font-bold">
                                    + Create New Role...
                                  </option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">
                                  Reset Password (leave empty to keep)
                                </label>
                                <div className="relative">
                                  <input
                                    id={`input-edit-password-${u.id}`}
                                    type={showEditPassword ? 'text' : 'password'}
                                    value={editPassword}
                                    onChange={(e) => setEditPassword(e.target.value)}
                                    placeholder="New password"
                                    className="w-full pl-2.5 pr-8 py-1.5 bg-black/40 border border-white/15 rounded text-xs text-white"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setShowEditPassword(!showEditPassword)}
                                    className="absolute right-2 top-2 text-slate-400 hover:text-white cursor-pointer"
                                  >
                                    {showEditPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-1">
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="px-2.5 py-1 text-xs text-slate-400 hover:text-white cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                id={`btn-save-edit-${u.id}`}
                                type="button"
                                onClick={() => handleSaveEdit(u.id)}
                                disabled={isSaving}
                                className="px-3.5 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-semibold text-white shadow cursor-pointer disabled:opacity-50"
                              >
                                {isSaving ? 'Saving...' : 'Save Changes'}
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={u.id}
                          className="p-3 sm:p-3.5 flex items-center justify-between gap-3 hover:bg-white/[0.02] transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#2E2BE6] to-[#E879F9] flex items-center justify-center text-white text-xs font-black uppercase shrink-0">
                              {u.name.slice(0, 2)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-xs text-white truncate">{u.name}</span>
                                {isSelf && (
                                  <span className="text-[10px] text-indigo-400 font-bold bg-indigo-500/10 px-1.5 py-0.2 rounded">
                                    You
                                  </span>
                                )}
                                {!u.active && (
                                  <span className="text-[10px] text-rose-400 font-bold bg-rose-500/10 px-1.5 py-0.2 rounded">
                                    Suspended
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 truncate">{u.email}</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider ${badgeClass}`}
                            >
                              {u.role}
                            </span>

                            <button
                              id={`btn-edit-user-${u.id}`}
                              onClick={() => startEdit(u)}
                              title="Edit Name, Email, Role, or Reset Password"
                              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              id={`btn-toggle-active-${u.id}`}
                              onClick={() => handleToggleActive(u)}
                              disabled={isSelf}
                              title={u.active ? 'Suspend Account' : 'Reactivate Account'}
                              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                isSelf
                                  ? 'opacity-30 cursor-not-allowed text-slate-500'
                                  : u.active
                                  ? 'text-slate-400 hover:text-amber-400 hover:bg-amber-500/10'
                                  : 'text-rose-400 hover:text-emerald-400 hover:bg-emerald-500/10'
                              }`}
                            >
                              {u.active ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                            </button>

                            <button
                              id={`btn-delete-user-${u.id}`}
                              onClick={() => handleDeleteUser(u)}
                              disabled={isSelf}
                              title="Permanently Delete User"
                              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                isSelf
                                  ? 'opacity-30 cursor-not-allowed text-slate-500'
                                  : 'text-slate-400 hover:text-rose-400 hover:bg-rose-500/10'
                              }`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 border-t border-white/10 bg-[#0B0B1E] flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span>Roles are securely enforced in Cloud SQL database and dynamically applied across team boards.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

        {/* Quick Create Role Modal Dialog */}
        {isQuickCreateRoleOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
            <div className="bg-[#121633] border border-white/20 rounded-2xl w-full max-w-md shadow-2xl p-5 text-white animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#2E2BE6] flex items-center justify-center text-white">
                    <Sparkles className="w-4 h-4 text-indigo-200" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Create New Role</h3>
                    <p className="text-[11px] text-slate-400">
                      Add a custom team role or department
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsQuickCreateRoleOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleQuickCreateRole} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1">
                    Role / Department Name *
                  </label>
                  <input
                    id="input-quick-role-name"
                    type="text"
                    required
                    autoFocus
                    value={quickRoleName}
                    onChange={(e) => setQuickRoleName(e.target.value)}
                    placeholder="e.g. Animators, QA, Script Writers"
                    className="w-full px-3 py-2 bg-black/50 border border-white/15 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    This name will appear on the team board department header and member badges.
                  </p>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1">
                    Description (Optional)
                  </label>
                  <input
                    id="input-quick-role-desc"
                    type="text"
                    value={quickRoleDesc}
                    onChange={(e) => setQuickRoleDesc(e.target.value)}
                    placeholder="Brief department responsibilities"
                    className="w-full px-3 py-2 bg-black/50 border border-white/15 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setIsQuickCreateRoleOpen(false)}
                    className="px-3.5 py-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    id="btn-submit-quick-role"
                    type="submit"
                    disabled={isSavingQuickRole}
                    className="px-4 py-1.5 rounded-lg bg-[#2E2BE6] hover:bg-[#221fd4] text-white text-xs font-semibold shadow disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                  >
                    {isSavingQuickRole ? (
                      'Creating...'
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>Create & Select Role</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete User Confirmation Modal */}
        {userToDelete && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="w-full max-w-sm bg-[#131722] border border-rose-500/30 rounded-2xl p-5 shadow-2xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Permanently Delete User?</h4>
                  <p className="text-xs text-slate-400">This action cannot be undone.</p>
                </div>
              </div>

              <div className="bg-black/40 rounded-xl p-3 border border-white/5 mb-4 text-xs text-slate-300">
                Are you sure you want to delete <strong className="text-white font-semibold">{userToDelete.name}</strong> (<span className="text-slate-400">{userToDelete.email}</span>)?
                Their employee column, assignments, and tasks will be removed.
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isExecutingDelete}
                  onClick={() => setUserToDelete(null)}
                  className="px-3.5 py-1.5 text-xs text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  id="btn-confirm-delete-user"
                  type="button"
                  disabled={isExecutingDelete}
                  onClick={executeDeleteUser}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow disabled:opacity-50 cursor-pointer flex items-center gap-1.5 transition-colors"
                >
                  {isExecutingDelete ? 'Deleting...' : 'Yes, Delete User'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Custom Role Confirmation Modal */}
        {roleToDelete && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="w-full max-w-sm bg-[#131722] border border-amber-500/30 rounded-2xl p-5 shadow-2xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Delete Custom Role?</h4>
                  <p className="text-xs text-slate-400">Role: {roleToDelete.name}</p>
                </div>
              </div>

              <div className="bg-black/40 rounded-xl p-3 border border-white/5 mb-4 text-xs text-slate-300">
                Are you sure you want to delete role <strong className="text-white font-semibold">{roleToDelete.name}</strong>?
                Any team members currently assigned this role will automatically revert to &quot;employee&quot;.
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isExecutingDelete}
                  onClick={() => setRoleToDelete(null)}
                  className="px-3.5 py-1.5 text-xs text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  id="btn-confirm-delete-role"
                  type="button"
                  disabled={isExecutingDelete}
                  onClick={executeDeleteRole}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow disabled:opacity-50 cursor-pointer flex items-center gap-1.5 transition-colors"
                >
                  {isExecutingDelete ? 'Deleting...' : 'Delete Role'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
