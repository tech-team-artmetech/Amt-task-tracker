import React, { useState, useEffect } from 'react';
import {
  Check,
  X,
  Plus,
  Trash2,
  Edit2,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  Sparkles,
  Eye,
  EyeOff,
  Layers,
  Send,
  HelpCircle,
  Calendar,
  Users,
  CheckCircle2,
} from 'lucide-react';
import { ReviewEmployee } from '../types';
import { api } from '../api';
import { extractTaskQuantity } from '../lib/quantity';

interface ReviewScreenProps {
  initialEmployees?: Array<{
    name: string;
    department?: string;
    originalExtractedName?: string;
    matchedName?: string;
    tasks: (string | { text: string; completed?: boolean })[];
  }> | null;
  imagePreview: string | null;
  initialDate?: string;
  autoMatchedCount?: number;
  onConfirmPublish: (employees: Array<{ name: string; department?: string; tasks: any[] }>, date?: string) => Promise<void>;
  onCancel: () => void;
  isPublishing: boolean;
}

export const ReviewScreen: React.FC<ReviewScreenProps> = ({
  initialEmployees,
  imagePreview,
  initialDate,
  autoMatchedCount = 0,
  onConfirmPublish,
  onCancel,
  isPublishing,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState<string>(initialDate || todayStr);
  const [registeredMembers, setRegisteredMembers] = useState<string[]>([]);
  const [isRosterLoaded, setIsRosterLoaded] = useState(false);

  // Load registered users so the admin can pick from a quick dropdown or auto-complete
  useEffect(() => {
    async function loadMembers() {
      try {
        const usersRes = await api.getUsers();
        if (usersRes?.users) {
          const names = usersRes.users
            .filter((u) => u.active && !u.name.toLowerCase().includes('admin team'))
            .map((u) => u.name.trim());
          setRegisteredMembers(Array.from(new Set(names)));
          setIsRosterLoaded(true);
        }
      } catch (e) {
        console.warn('Could not load user roster for review screen:', e);
      }
    }
    loadMembers();
  }, []);

  // Convert into internal review model with stable IDs for editing with safe array guards
  const [employees, setEmployees] = useState<ReviewEmployee[]>(() => {
    const safeList = Array.isArray(initialEmployees) ? [...initialEmployees] : [];
    // Ensure columns with tasks appear first on the left, empty columns towards the right end
    safeList.sort((a: any, b: any) => {
      const aTasks = Array.isArray(a?.tasks) ? a.tasks.length : 0;
      const bTasks = Array.isArray(b?.tasks) ? b.tasks.length : 0;
      if (aTasks > 0 && bTasks === 0) return -1;
      if (aTasks === 0 && bTasks > 0) return 1;
      return 0;
    });
    return safeList.map((emp: any, i) => {
      const safeTasks = Array.isArray(emp?.tasks) ? emp.tasks : [];
      return {
        id: `emp-${i}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: typeof emp?.name === 'string' && emp.name.trim().length > 0 ? emp.name.trim() : `Team Member ${i + 1}`,
        department: typeof emp?.department === 'string' ? emp.department : 'General',
        originalExtractedName: emp?.originalExtractedName,
        matchedName: emp?.matchedName,
        tasks: safeTasks.map((t: any, tIdx: number) => {
          let text = '';
          if (typeof t === 'string') {
            text = t;
          } else if (t && typeof t === 'object') {
            text = String(t.text || '');
          }
          text = text.replace(/~~|\[x\]|\(done\)|\(finished\)|\(completed\)|\(struck(\s+through)?\)|\(crossed(\s+out)?\)/gi, '').replace(/[\u0335\u0336\u0337\u0338]/g, '').trim();

          const qtyInfo = extractTaskQuantity(text);
          const totalQty = (t as any).totalQuantity || qtyInfo.totalQuantity;
          // Keep tasks Gemini read as crossed out / done on the board (all units done for quantity tasks)
          const markedDone = Boolean(t && typeof t === 'object' && t.completed);
          const completedQty = markedDone ? totalQty : Number((t as any).completedQuantity || 0);

          return {
            id: `task-${i}-${tIdx}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            text,
            completed: totalQty > 1 ? completedQty >= totalQty : markedDone,
            totalQuantity: totalQty,
            completedQuantity: completedQty,
          };
        }),
      };
    });
  });

  const [showImagePreview, setShowImagePreview] = useState(true);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Editing names
  const [editingEmpId, setEditingEmpId] = useState<string | null>(null);
  const [editingEmpName, setEditingEmpName] = useState('');

  // Editing task text
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskText, setEditingTaskText] = useState('');

  // Adding new person
  const [isAddingPerson, setIsAddingPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');

  // Adding new task
  const [addingTaskEmpId, setAddingTaskEmpId] = useState<string | null>(null);
  const [newTaskText, setNewTaskText] = useState('');

  // ================= ACTIONS =================
  const handleRenamePerson = (empId: string) => {
    if (!editingEmpName.trim()) return;
    setEmployees((prev) =>
      prev.map((emp) => (emp.id === empId ? { ...emp, name: editingEmpName.trim() } : emp))
    );
    setEditingEmpId(null);
  };

  const handleAddPerson = () => {
    if (!newPersonName.trim()) return;
    setEmployees((prev) => [
      ...prev,
      {
        id: `emp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: newPersonName.trim(),
        tasks: [],
      },
    ]);
    setNewPersonName('');
    setIsAddingPerson(false);
  };

  const handleRemovePerson = (empId: string) => {
    setEmployees((prev) => prev.filter((emp) => emp.id !== empId));
  };

  const handleEditTask = (taskId: string) => {
    if (!editingTaskText.trim()) return;
    const cleanText = editingTaskText.trim();
    const qtyInfo = extractTaskQuantity(cleanText);
    setEmployees((prev) =>
      prev.map((emp) => ({
        ...emp,
        tasks: (Array.isArray(emp.tasks) ? emp.tasks : []).map((t) =>
          t.id === taskId
            ? {
                ...t,
                text: cleanText,
                totalQuantity: qtyInfo.totalQuantity,
                completedQuantity: Math.min(qtyInfo.totalQuantity, t.completedQuantity || 0),
                completed: qtyInfo.totalQuantity > 1 ? (t.completedQuantity || 0) >= qtyInfo.totalQuantity : t.completed,
              }
            : t
        ),
      }))
    );
    setEditingTaskId(null);
  };

  const handleAddTask = (empId: string) => {
    if (!newTaskText.trim()) return;
    const cleanText = newTaskText.trim();
    const qtyInfo = extractTaskQuantity(cleanText);
    setEmployees((prev) =>
      prev.map((emp) => {
        if (emp.id !== empId) return emp;
        const currentTasks = Array.isArray(emp.tasks) ? emp.tasks : [];
        return {
          ...emp,
          tasks: [
            ...currentTasks,
            {
              id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              text: cleanText,
              completed: false,
              totalQuantity: qtyInfo.totalQuantity,
              completedQuantity: 0,
            },
          ],
        };
      })
    );
    setNewTaskText('');
    setAddingTaskEmpId(null);
  };

  const handleDeleteTask = (empId: string, taskId: string) => {
    setEmployees((prev) =>
      prev.map((emp) => {
        if (emp.id !== empId) return emp;
        const currentTasks = Array.isArray(emp.tasks) ? emp.tasks : [];
        return {
          ...emp,
          tasks: currentTasks.filter((t) => t.id !== taskId),
        };
      })
    );
  };

  const handleMoveTaskPriority = (empId: string, taskIndex: number, direction: 'up' | 'down') => {
    setEmployees((prev) =>
      prev.map((emp) => {
        if (emp.id !== empId) return emp;
        const currentTasks = Array.isArray(emp.tasks) ? [...emp.tasks] : [];
        const targetIndex = direction === 'up' ? taskIndex - 1 : taskIndex + 1;
        if (targetIndex < 0 || targetIndex >= currentTasks.length) return emp;
        const [moved] = currentTasks.splice(taskIndex, 1);
        currentTasks.splice(targetIndex, 0, moved);
        return { ...emp, tasks: currentTasks };
      })
    );
  };

  const handleToggleTaskCompleted = (empId: string, taskId: string) => {
    setEmployees((prev) =>
      prev.map((emp) => {
        if (emp.id !== empId) return emp;
        const currentTasks = Array.isArray(emp.tasks) ? emp.tasks : [];
        return {
          ...emp,
          tasks: currentTasks.map((t) => {
            if (t.id !== taskId) return t;
            const nextDone = !t.completed;
            const totalQty = t.totalQuantity || 1;
            return {
              ...t,
              completed: nextDone,
              completedQuantity: nextDone ? totalQty : 0,
            };
          }),
        };
      })
    );
  };

  const handleSetTaskUnitCompleted = (empId: string, taskId: string, unitNumber: number) => {
    setEmployees((prev) =>
      prev.map((emp) => {
        if (emp.id !== empId) return emp;
        const currentTasks = Array.isArray(emp.tasks) ? emp.tasks : [];
        return {
          ...emp,
          tasks: currentTasks.map((t) => {
            if (t.id !== taskId) return t;
            const totalQty = t.totalQuantity || 1;
            const curDone = t.completedQuantity || 0;
            // If already done at or above this unit, uncheck down to unitNumber - 1; otherwise check up to unitNumber
            const nextQty = curDone >= unitNumber ? unitNumber - 1 : unitNumber;
            const cleanQty = Math.max(0, Math.min(totalQty, nextQty));
            return {
              ...t,
              completedQuantity: cleanQty,
              completed: cleanQty >= totalQty,
            };
          }),
        };
      })
    );
  };

  const handleSetDepartment = (empId: string, department: string) => {
    setEmployees((prev) =>
      prev.map((emp) => (emp.id === empId ? { ...emp, department } : emp))
    );
  };

  const handleFinalPublish = async () => {
    const payload = employeesWithAccount.map((emp) => ({
      name: emp.name,
      department: emp.department || 'General',
      tasks: (Array.isArray(emp.tasks) ? emp.tasks : []).map((t) => {
        const totalQty = t.totalQuantity || extractTaskQuantity(t.text).totalQuantity;
        const completedQty = t.completedQuantity !== undefined ? t.completedQuantity : (t.completed ? totalQty : 0);
        return {
          text: t.text,
          completed: totalQty > 1 ? completedQty >= totalQty : Boolean(t.completed),
          totalQuantity: totalQty,
          completedQuantity: completedQty,
        };
      }),
    }));

    // Ensure columns with tasks appear from the left, empty columns towards the right end
    payload.sort((a, b) => {
      const aTasks = a.tasks.length;
      const bTasks = b.tasks.length;
      if (aTasks > 0 && bTasks === 0) return -1;
      if (aTasks === 0 && bTasks > 0) return 1;
      return 0;
    });

    await onConfirmPublish(payload, selectedDate);
  };

  // Only people with an account go on the board; anyone else is skipped when publishing
  const registeredNameKeys = new Set(registeredMembers.map((m) => m.toLowerCase()));
  const hasAccount = (name: string) => !isRosterLoaded || registeredNameKeys.has(name.trim().toLowerCase());
  const employeesWithAccount = employees.filter((emp) => hasAccount(emp.name));
  const namesWithoutAccount = employees.filter((emp) => !hasAccount(emp.name)).map((emp) => emp.name);
  const canPublish = !isPublishing && employeesWithAccount.length > 0;

  const totalTasks = employees.reduce(
    (acc, emp) => acc + (Array.isArray(emp?.tasks) ? emp.tasks.length : 0),
    0
  );

  return (
    <div className="flex-1 bg-slate-100 flex flex-col min-h-screen w-full max-w-full overflow-x-hidden">
      {/* Top Review Bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 px-3.5 sm:px-8 py-3.5 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                  Review Extracted Tasklist
                </h2>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                  Verification
                </span>
                {/* Target Date Pill */}
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold">
                  <Calendar className="w-3 h-3 text-indigo-600" />
                  <span>Target Date: {selectedDate}</span>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Fix any handwriting misreads, rename people, or adjust task priority before publishing.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Date input for changing target date during review */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
              <label htmlFor="review-tasklist-date" className="text-[11px] font-semibold text-slate-600">
                Date:
              </label>
              <input
                id="review-tasklist-date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-900 focus:outline-none cursor-pointer"
              />
            </div>

            {imagePreview && (
              <button
                id="btn-toggle-photo-preview"
                onClick={() => setShowImagePreview(!showImagePreview)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors"
              >
                {showImagePreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showImagePreview ? 'Hide Photo' : 'Show Photo'}</span>
              </button>
            )}

            <button
              onClick={onCancel}
              disabled={isPublishing}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              Discard & Cancel
            </button>

            <button
              id="btn-publish-board-confirm"
              onClick={() => setShowConfirmModal(true)}
              disabled={!canPublish}
              title={employees.length > 0 && employeesWithAccount.length === 0 ? 'Nobody here has an account yet' : undefined}
              className={`px-4 py-2 rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-all ${
                !canPublish
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Confirm & Publish Board</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Review Body */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        {/* Handwriting disclaimer notice & Auto-Match Status */}
        <div className="flex flex-col gap-2.5">
          {autoMatchedCount > 0 && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs flex items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>AI Database Match:</strong> {autoMatchedCount} handwriting misread{autoMatchedCount > 1 ? 's were' : ' was'} automatically corrected to match your registered team members.
                </span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                Matched to Roster
              </span>
            </div>
          )}

          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-bold">Handwriting OCR verification: </span>
              Compare the extracted columns against your tasklist photo.
              Click the pencil icon next to any person's name to change or select from your registered employees.
              Once confirmed, these tasks will be <strong>added to the board for {selectedDate}</strong>. Tasks already on that day stay as they are, and any task already there is not added twice.
            </div>
          </div>

          {namesWithoutAccount.length > 0 && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-bold">No account, will be skipped: </span>
                {namesWithoutAccount.join(', ')}. Only people with an account go on the board, so {namesWithoutAccount.length > 1 ? 'these columns' : 'this column'} won't be published. To include {namesWithoutAccount.length > 1 ? 'them' : 'it'}, click the pencil icon and pick a registered person, or upload again once they have an account.
              </div>
            </div>
          )}
        </div>

        {/* Optional Collapsible Source Photo Preview */}
        {showImagePreview && imagePreview && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Source Tasklist Photo Reference
              </span>
              <span className="text-[11px] text-slate-400">Zoom / scroll to inspect handwriting</span>
            </div>
            <div className="max-h-72 overflow-auto rounded-lg bg-slate-900 flex items-center justify-center p-2 border border-slate-800">
              <img
                src={imagePreview}
                alt="Source Photo"
                className="max-h-64 object-contain rounded"
              />
            </div>
          </div>
        )}

        {/* Registered Team Members Datalist */}
        <datalist id="registered-team-roster">
          {registeredMembers.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>

        {/* Columns Toolbar */}
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-600 flex items-center gap-2">
            <span>
              <span className="font-bold text-slate-900">{employees.length}</span> Team Columns ·{' '}
              <span className="font-bold text-slate-900">{totalTasks}</span> Extracted Tasks
            </span>
            {registeredMembers.length > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-medium border border-slate-200">
                <Users className="w-3 h-3 text-slate-400" />
                {registeredMembers.length} Registered Team Members
              </span>
            )}
          </div>

          <button
            id="btn-review-add-person"
            onClick={() => setIsAddingPerson(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-indigo-600 border border-indigo-200 rounded-lg text-xs font-semibold shadow-2xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Team Member</span>
          </button>
        </div>

        {/* Add Person Inline Field */}
        {isAddingPerson && (
          <div className="bg-white border border-indigo-300 rounded-xl p-3 shadow-xs flex items-center gap-3">
            <input
              type="text"
              list="registered-team-roster"
              placeholder="Enter or select registered person (e.g. Om, Pooja, Hardik)..."
              value={newPersonName}
              onChange={(e) => setNewPersonName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddPerson()}
              autoFocus
              className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              onClick={handleAddPerson}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold"
            >
              Add Person
            </button>
            <button
              onClick={() => {
                setIsAddingPerson(false);
                setNewPersonName('');
              }}
              className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Extracted Columns Grid or Empty State */}
        {employees.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center flex flex-col items-center justify-center max-w-lg mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mb-3">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm mb-1">No Columns on Board</h3>
            <p className="text-xs text-slate-500 mb-4">
              You can manually add team columns and tasks, or cancel to upload another photo.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsAddingPerson(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full text-xs font-bold shadow-xs flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Team Member</span>
              </button>
              <button
                onClick={onCancel}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full text-xs font-bold"
              >
                Cancel & Upload Again
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2.5 sm:gap-6 overflow-x-auto pb-8 touch-pan-x min-w-0 w-full">
            {employees.map((emp) => {
              const safeTasks = Array.isArray(emp.tasks) ? emp.tasks : [];

              return (
                <div
                  key={emp.id}
                  className="flex-shrink-0 w-[215px] sm:w-80 bg-white border border-slate-200 rounded-xl shadow-xs flex flex-col"
                >
                    {/* Column Header (Name + Controls) */}
                  <div className="p-2.5 sm:p-3.5 border-b border-slate-200 bg-slate-50/70 rounded-t-xl flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      {editingEmpId === emp.id ? (
                        <div className="flex items-center gap-1 flex-1">
                          <input
                            type="text"
                            list="registered-team-roster"
                            value={editingEmpName}
                            onChange={(e) => setEditingEmpName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleRenamePerson(emp.id)}
                            autoFocus
                            placeholder="Select or type name..."
                            className="px-2 py-1 border border-indigo-400 rounded text-xs text-slate-900 w-full focus:outline-none bg-white"
                          />
                          <button
                            onClick={() => handleRenamePerson(emp.id)}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingEmpId(null)}
                            className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-bold text-sm text-slate-900 truncate">{emp.name}</span>
                            <button
                              onClick={() => {
                                setEditingEmpId(emp.id);
                                setEditingEmpName(emp.name);
                              }}
                              title="Rename person or pick registered team member"
                              className="p-1 text-slate-400 hover:text-slate-700 rounded"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                          {emp.originalExtractedName && emp.originalExtractedName.toLowerCase() !== emp.name.toLowerCase() && (
                            <span
                              className="text-[10px] text-emerald-700 flex items-center gap-0.5 mt-0.5 font-medium"
                              title={`Board handwriting read as "${emp.originalExtractedName}", automatically matched to "${emp.name}" in team roster`}
                            >
                              <Sparkles className="w-2.5 h-2.5 text-emerald-600" />
                              <span>Matched from "{emp.originalExtractedName}"</span>
                            </span>
                          )}
                          {!hasAccount(emp.name) && (
                            <span className="text-[10px] text-rose-700 flex items-center gap-0.5 mt-0.5 font-semibold">
                              <AlertTriangle className="w-2.5 h-2.5 text-rose-600" />
                              <span>No account, will be skipped</span>
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700">
                          {safeTasks.length}
                        </span>
                        <button
                          onClick={() => handleRemovePerson(emp.id)}
                          title="Remove column"
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Department Assignment */}
                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200/60">
                      <span className="text-slate-400 font-semibold text-[10px] uppercase tracking-wider">Department:</span>
                      <select
                        value={emp.department || 'General'}
                        onChange={(e) => handleSetDepartment(emp.id, e.target.value)}
                        className="text-[11px] font-bold py-1 px-2 rounded-lg border border-slate-200 bg-white text-slate-800 shadow-2xs focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                      >
                        <option value="Editors">Editors</option>
                        <option value="Designers">Designers</option>
                        <option value="Managers">Managers</option>
                        <option value="Cinematographers">Cinematographers</option>
                        <option value="General">General</option>
                      </select>
                    </div>
                  </div>

                  {/* Tasks List */}
                  <div className="p-3 flex flex-col gap-2 min-h-56">
                    {safeTasks.length === 0 ? (
                      <div className="h-24 border border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center text-slate-400 text-xs">
                        No tasks extracted
                      </div>
                    ) : (
                      safeTasks.map((task, tIdx) => {
                        const isTopPriority = tIdx === 0;
                        const isTaskDone = Boolean(task.completed);

                        return (
                          <div
                            key={task.id}
                            className={`rounded-xl border p-3 transition-all ${
                              isTaskDone
                                ? 'bg-slate-50/80 border-slate-200 opacity-90'
                                : isTopPriority
                                ? 'bg-white border-indigo-200 ring-1 ring-indigo-50 shadow-xs'
                                : 'bg-white border-slate-200'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5 gap-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {task.totalQuantity && task.totalQuantity > 1 ? (
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <span className="text-[10px] font-bold text-slate-500 mr-0.5">
                                      Units ({task.completedQuantity || 0}/{task.totalQuantity}):
                                    </span>
                                    {Array.from({ length: task.totalQuantity }).map((_, uIdx) => {
                                      const unitNumber = uIdx + 1;
                                      const isUnitDone = (task.completedQuantity || 0) >= unitNumber;
                                      return (
                                        <label
                                          key={uIdx}
                                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-bold cursor-pointer select-none transition-all ${
                                            isUnitDone
                                              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                          }`}
                                          title={`Check to mark unit #${unitNumber} completed`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isUnitDone}
                                            onChange={() => handleSetTaskUnitCompleted(emp.id, task.id, unitNumber)}
                                            className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                          />
                                          <span>#{unitNumber}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <label
                                    className="inline-flex items-center gap-1 cursor-pointer select-none"
                                    title="Check if this task is completed"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isTaskDone}
                                      onChange={() => handleToggleTaskCompleted(emp.id, task.id)}
                                      className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                    />
                                    <span className={`text-[10px] ${isTaskDone ? 'text-emerald-700 font-bold' : 'text-slate-400 hover:text-slate-600'}`}>
                                      Done
                                    </span>
                                  </label>
                                )}

                                {isTopPriority && !isTaskDone && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0A0E2A] text-white tracking-wide">
                                    Priority 1
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {/* Priority up/down controls */}
                                <button
                                  onClick={() => handleMoveTaskPriority(emp.id, tIdx, 'up')}
                                  disabled={tIdx === 0}
                                  title="Move Task Up (Top is Priority 1)"
                                  className={`p-1 rounded-full ${
                                    tIdx === 0
                                      ? 'text-slate-200 cursor-not-allowed'
                                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                                  }`}
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleMoveTaskPriority(emp.id, tIdx, 'down')}
                                  disabled={tIdx === safeTasks.length - 1}
                                  title="Move Task Down"
                                  className={`p-1 rounded-full ${
                                    tIdx === safeTasks.length - 1
                                      ? 'text-slate-200 cursor-not-allowed'
                                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                                  }`}
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  onClick={() => {
                                    setEditingTaskId(task.id);
                                    setEditingTaskText(task.text);
                                  }}
                                  title="Edit task text"
                                  className="p-1 text-slate-400 hover:text-slate-700 rounded"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>

                                <button
                                  onClick={() => handleDeleteTask(emp.id, task.id)}
                                  title="Delete task"
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            {/* Task Content */}
                            {editingTaskId === task.id ? (
                              <div className="flex items-center gap-1 mt-1">
                                <input
                                  type="text"
                                  value={editingTaskText}
                                  onChange={(e) => setEditingTaskText(e.target.value)}
                                  onKeyDown={(e) => e.key === 'Enter' && handleEditTask(task.id)}
                                  autoFocus
                                  className="px-2 py-1 border border-indigo-400 rounded text-xs text-slate-900 w-full focus:outline-none"
                                />
                                <button
                                  onClick={() => handleEditTask(task.id)}
                                  className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setEditingTaskId(null)}
                                  className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <p className="text-xs leading-snug break-words text-slate-800 font-medium">
                                {task.text}
                              </p>
                            )}
                          </div>
                        );
                      })
                    )}

                    {/* Inline Add Task Field */}
                    {addingTaskEmpId === emp.id ? (
                      <div className="p-2 border border-dashed border-indigo-300 rounded-xl bg-indigo-50/30 flex flex-col gap-2 mt-1">
                        <textarea
                          placeholder="Type task description..."
                          value={newTaskText}
                          onChange={(e) => setNewTaskText(e.target.value)}
                          rows={2}
                          autoFocus
                          className="w-full p-2 text-xs border border-slate-300 rounded bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                        />
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setAddingTaskEmpId(null);
                              setNewTaskText('');
                            }}
                            className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleAddTask(emp.id)}
                            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold"
                          >
                            Add Task
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingTaskEmpId(emp.id)}
                        className="mt-1 py-1.5 px-3 border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/20 text-slate-500 hover:text-indigo-600 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Task</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-2">
              Publish Board for {selectedDate}?
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-6">
              Confirming this review will add these {totalTasks} verified tasks for {employees.length} people to <strong>{selectedDate}</strong>. Tasks already on the board for that day are kept. Any uncompleted tasks from prior days will automatically carry forward.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isPublishing}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Go Back & Review More
              </button>

              <button
                type="button"
                id="btn-confirm-final-publish"
                onClick={async () => {
                  setShowConfirmModal(false);
                  await handleFinalPublish();
                }}
                disabled={isPublishing}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm flex items-center gap-1.5"
              >
                {isPublishing ? (
                  <span>Publishing Board...</span>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Yes, Publish to Live Board</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
