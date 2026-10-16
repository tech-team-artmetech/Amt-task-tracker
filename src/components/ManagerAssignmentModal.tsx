import React, { useState, useEffect, useRef } from 'react';
import { X, Users, UserCheck, Shield, Check, AlertCircle, RefreshCw, Sparkles, ArrowRight } from 'lucide-react';
import { api } from '../api';
import { BoardColumn, ManagerOption, BoardData } from '../types';

interface ManagerAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  columns: BoardColumn[];
  onAssignmentsUpdated: (board: BoardData) => void;
  selectedDate?: string;
}

interface DisplayMember {
  id: string;
  name: string;
  department?: string;
  taskCount: number;
}

export const ManagerAssignmentModal: React.FC<ManagerAssignmentModalProps> = ({
  isOpen,
  onClose,
  columns,
  onAssignmentsUpdated,
  selectedDate,
}) => {
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [displayMembers, setDisplayMembers] = useState<DisplayMember[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({}); // employeeName -> managerIds[]
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Live board refreshes hand us a new `columns` array every few seconds. Read it through a ref so
  // the checkboxes load once when the modal opens and unsaved ticks aren't reset by a refresh.
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  useEffect(() => {
    if (!isOpen) return;
    const columns = columnsRef.current;
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    Promise.all([api.getManagers(), api.getAssignments(), api.getUsers()])
      .then(([mgrRes, assignRes, usersRes]) => {
        setManagers(mgrRes.managers || []);

        // 1. Build comprehensive list of all members (combining active columns and registered users)
        const memberMap = new Map<string, DisplayMember>();

        // Add all existing board columns
        columns.forEach((col) => {
          const key = col.employeeName.trim().toLowerCase();
          if (['shreay', 'aa'].includes(key)) return;
          memberMap.set(key, {
            id: col.id,
            name: col.employeeName,
            department: col.department || 'General',
            taskCount: col.tasks?.length || 0,
          });
        });

        // Add all registered non-admin users if not already present
        (usersRes.users || []).forEach((u) => {
          if (u.role?.toLowerCase() === 'admin' || !u.active) return;
          const key = u.name.trim().toLowerCase();
          if (['shreay', 'aa'].includes(key)) return;
          if (!memberMap.has(key)) {
            memberMap.set(key, {
              id: u.id,
              name: u.name,
              department: u.role === 'manager' ? 'Managers' : (u.role || 'General'),
              taskCount: 0,
            });
          }
        });

        const membersList = Array.from(memberMap.values());
        setDisplayMembers(membersList);

        const map: Record<string, string[]> = {};
        membersList.forEach((m) => {
          map[m.name] = [];
        });

        (assignRes.assignments || []).forEach((a) => {
          const key = (a.employeeName || '').trim().toLowerCase();
          const matchedMember = membersList.find(m => m.name.trim().toLowerCase() === key);
          const targetKey = matchedMember ? matchedMember.name : a.employeeName;
          if (!map[targetKey]) map[targetKey] = [];
          if (!map[targetKey].includes(a.managerId)) {
            map[targetKey].push(a.managerId);
          }
        });

        // Fallback to col.managerId / col.managerIds if assignRes was empty
        columns.forEach((col) => {
          if (!map[col.employeeName] || map[col.employeeName].length === 0) {
            if (col.managerIds && col.managerIds.length > 0) {
              map[col.employeeName] = [...col.managerIds];
            } else if (col.managerId) {
              map[col.employeeName] = [col.managerId];
            }
          }
        });

        setAssignments(map);
      })
      .catch((err) => {
        console.error('Failed to load managers, assignments, or users', err);
        setError('Could not load manager accounts or assignments.');
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggleManager = (employeeName: string, managerId: string) => {
    setAssignments((prev) => {
      const current = prev[employeeName] || [];
      const next = current.includes(managerId)
        ? current.filter((id) => id !== managerId)
        : [...current, managerId];
      return { ...prev, [employeeName]: next };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const payload = Object.entries(assignments).map(([employeeName, managerIds]) => ({
        employeeName,
        managerIds,
      }));

      const res = await api.bulkAssignEmployees(payload, selectedDate);
      onAssignmentsUpdated(res.board);
      setSuccessMsg('Team member assignments successfully updated!');
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Failed to update team member assignments.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Deep Blue Geometric Header */}
        <div className="bg-[#0A0E2A] p-4 sm:p-6 text-white relative overflow-hidden shrink-0">
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full border border-white/10 pointer-events-none" />
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 sm:w-10 h-9 sm:h-10 rounded-2xl bg-[#2E2BE6] text-white flex items-center justify-center shadow-md shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-extrabold text-sm sm:text-base uppercase tracking-tight text-white">
                  Manage Column Visibility for Managers
                </h3>
                <p className="text-xs text-slate-300">
                  Select which employee columns each manager can view and reorder on their board (<span className="text-emerald-400 font-bold">multiple allowed</span>).
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 sm:space-y-5">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Manager Summary Badges */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-[#2E2BE6]" />
              Available Managers
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {managers.map((mgr) => {
                const count = Object.values(assignments).filter((ids) => ids.includes(mgr.id)).length;
                return (
                  <div
                    key={mgr.id}
                    className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between shadow-xs"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-900">{mgr.name}</div>
                      <div className="text-[10px] text-slate-500">{mgr.email}</div>
                    </div>
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#2E2BE6]/10 text-[#2E2BE6]">
                      {count} {count === 1 ? 'member' : 'members'}
                    </span>
                  </div>
                );
              })}
              {managers.length === 0 && (
                <div className="text-xs text-slate-500 p-2 italic">Loading managers...</div>
              )}
            </div>
          </div>

          {/* Team Member List with Multi-Manager Checkboxes */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              <span>Employee Column</span>
              <span>Visible to Managers (Multi-select)</span>
            </div>

            <div className="divide-y divide-slate-100">
              {displayMembers.map((member) => {
                const assignedMgrIds = assignments[member.name] || [];
                return (
                  <div
                    key={member.id}
                    className="p-3.5 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#0A0E2A] text-white flex items-center justify-center font-bold text-xs uppercase shrink-0">
                        {member.name.charAt(0)}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{member.name}</span>
                          {member.department && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                              {member.department}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {member.taskCount} {member.taskCount === 1 ? 'task' : 'tasks'} on board
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 max-w-sm">
                      {managers
                        .filter((mgr) => mgr.name.toLowerCase().trim() !== member.name.toLowerCase().trim())
                        .map((mgr) => {
                          const isAssigned = assignedMgrIds.includes(mgr.id);
                          return (
                            <button
                              key={mgr.id}
                              type="button"
                              onClick={() => handleToggleManager(member.name, mgr.id)}
                              className={`text-[11px] font-bold px-2.5 py-1 rounded-xl border transition-colors flex items-center gap-1.5 cursor-pointer ${
                                isAssigned
                                  ? 'bg-[#2E2BE6] text-white border-[#2E2BE6] shadow-xs'
                                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <span className={`w-3 h-3 rounded-full flex items-center justify-center text-[9px] ${isAssigned ? 'bg-white text-[#2E2BE6]' : 'bg-slate-100 text-slate-400'}`}>
                                {isAssigned ? '✓' : ''}
                              </span>
                              {mgr.name.split(' ')[0]}
                            </button>
                          );
                        })}
                      {managers.length === 0 && (
                        <div className="text-xs text-slate-400 italic">No managers</div>
                      )}
                    </div>
                  </div>
                );
              })}

              {displayMembers.length === 0 && (
                <div className="p-6 text-center text-xs text-slate-500">
                  {loading ? 'Loading team members...' : 'No employees or team members found.'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500">
            {loading ? 'Loading assignments...' : 'Changes apply immediately on save.'}
          </div>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-[#2E2BE6] hover:bg-[#2522c7] shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Save Visibility Settings
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
