import React, { useState, useEffect, useMemo } from 'react';
import {
  GripVertical,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  AlertCircle,
  Camera,
  Layers,
  Sparkles,
  ArrowUpDown,
  Lock,
  MessageSquare,
  Send,
  CheckCircle2,
  Filter,
  Flame,
  ArrowRight,
  Calendar,
  AlertTriangle,
  Users,
  ShieldCheck,
  UserCheck,
  ChevronUp,
  ChevronDown,
  FileSpreadsheet,
  Clock,
  Briefcase,
  Eye,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { BoardData, BoardColumn, BoardTask, User } from '../types';
import { DateSelector } from './DateSelector';
import { ManagerAssignmentModal } from './ManagerAssignmentModal';
import { MonthlyReportModal } from './MonthlyReportModal';
import { api } from '../api';
import { getTaskUnits } from '../lib/quantity';
import { getColumnManagers, getManagerBadgeLabel } from '../lib/managers';

interface BoardViewProps {
  board: BoardData | null;
  user: User;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onOpenUpload: () => void;
  onReorder: (columns: BoardColumn[], date?: string) => Promise<void>;
  onAdminEdit: (
    action: {
      type: 'rename_column' | 'add_column' | 'delete_column' | 'add_task' | 'edit_task' | 'delete_task' | 'delete_day_tasks';
      columnId?: string;
      taskId?: string;
      name?: string;
      text?: string;
      assignedDate?: string;
    },
    date?: string
  ) => Promise<void>;
  onAddComment?: (taskId: string, content: string) => Promise<void>;
  onDeleteComment?: (taskId: string, commentId: string) => Promise<void>;
  onToggleTaskComplete?: (taskId: string, completed?: boolean, completedQuantity?: number, totalQuantity?: number) => Promise<void>;
  onApproveTask?: (taskId: string, approved: boolean) => Promise<void>;
  onBoardUpdated?: (board: BoardData) => void;
  isAssignModalOpen?: boolean;
  setIsAssignModalOpen?: (open: boolean) => void;
  isReportModalOpen?: boolean;
  setIsReportModalOpen?: (open: boolean) => void;
}

type TaskFilterType = 'all' | 'p1' | 'given' | 'carried' | 'pending' | 'finished';

function matchesEmployee(columnName: string, userName?: string, userEmail?: string): boolean {
  if (!columnName || !userName) return false;
  const col = columnName.trim().toLowerCase();
  const usr = userName.trim().toLowerCase();
  const emailPrefix = userEmail ? userEmail.split('@')[0].trim().toLowerCase() : '';

  if (col === usr) return true;
  if (emailPrefix && col === emailPrefix) return true;

  // Match first names (e.g. "Om" matching "Om Patel" or "Elena Employee" matching "Elena")
  const colFirst = col.split(' ')[0];
  const usrFirst = usr.split(' ')[0];
  if (colFirst && colFirst === usrFirst) return true;
  if (colFirst && colFirst === usr) return true;
  if (usrFirst && usrFirst === col) return true;

  return false;
}

export const BoardView: React.FC<BoardViewProps> = ({
  board,
  user,
  selectedDate,
  onSelectDate,
  onOpenUpload,
  onReorder,
  onAdminEdit,
  onAddComment,
  onDeleteComment,
  onToggleTaskComplete,
  onApproveTask,
  onBoardUpdated,
  isAssignModalOpen: propsIsAssignOpen,
  setIsAssignModalOpen: propsSetIsAssignOpen,
  isReportModalOpen: propsIsReportOpen,
  setIsReportModalOpen: propsSetIsReportOpen,
}) => {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [draggedSourceColId, setDraggedSourceColId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [approvingTaskIds, setApprovingTaskIds] = useState<Record<string, boolean>>({});

  // Column drag and drop reshuffling state (Admin only)
  const [draggedColId, setDraggedColId] = useState<string | null>(null);
  const [dragOverColDropTargetId, setDragOverColDropTargetId] = useState<string | null>(null);
  const [dragOverColSide, setDragOverColSide] = useState<'left' | 'right' | null>(null);

  // Editing state for Admin
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskText, setEditTaskText] = useState('');
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [editColName, setEditColName] = useState('');

  // Adding state for Admin
  const [addingTaskColId, setAddingTaskColId] = useState<string | null>(null);
  const [newTaskText, setNewTaskText] = useState('');
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');

  // Comments state (Admin & Manager can post/delete comments)
  const [openCommentsTaskIds, setOpenCommentsTaskIds] = useState<Record<string, boolean>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [isSubmittingComment, setIsSubmittingComment] = useState<Record<string, boolean>>({});

  // Task completion state & filtering
  const [togglingTaskIds, setTogglingTaskIds] = useState<Record<string, boolean>>({});
  const [taskFilter, setTaskFilter] = useState<TaskFilterType>('all');
  const [internalAssignOpen, setInternalAssignOpen] = useState(false);
  const [internalReportOpen, setInternalReportOpen] = useState(false);

  const isAssignModalOpen = propsIsAssignOpen !== undefined ? propsIsAssignOpen : internalAssignOpen;
  const setIsAssignModalOpen = propsSetIsAssignOpen !== undefined ? propsSetIsAssignOpen : setInternalAssignOpen;

  const isReportModalOpen = propsIsReportOpen !== undefined ? propsIsReportOpen : internalReportOpen;
  const setIsReportModalOpen = propsSetIsReportOpen !== undefined ? propsSetIsReportOpen : setInternalReportOpen;
  const [showDeleteDayModal, setShowDeleteDayModal] = useState(false);
  const [isDeletingDay, setIsDeletingDay] = useState(false);
  const [columnToClear, setColumnToClear] = useState<{ id: string; name: string } | null>(null);
  const [isClearingColumnTasks, setIsClearingColumnTasks] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  const handleDeleteDayTasks = async () => {
    setIsDeletingDay(true);
    try {
      await onAdminEdit({ type: 'delete_day_tasks' }, selectedDate);
      setShowDeleteDayModal(false);
    } catch (err: any) {
      console.error('Failed to delete day tasks:', err);
    } finally {
      setIsDeletingDay(false);
    }
  };

  // Detect touch-capable devices to optimize mobile touch scrolling
  useEffect(() => {
    const checkTouch = () => {
      setIsTouchDevice(
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
      );
    };
    checkTouch();
  }, []);

  // Monitor window scroll to display smooth scroll-to-top button
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      setShowScrollTop(scrollY > 200);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
    document.body.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleTask = async (taskId: string, nextCompleted: boolean, columnEmployeeName?: string) => {
    if (!onToggleTaskComplete) return;
    if (columnEmployeeName && !isAdmin && !isManager) {
      const isMine = matchesEmployee(columnEmployeeName, user.name, user.email);
      if (!isMine) {
        return;
      }
    }
    setTogglingTaskIds((prev) => ({ ...prev, [taskId]: true }));
    try {
      await onToggleTaskComplete(taskId, nextCompleted);
    } finally {
      setTogglingTaskIds((prev) => ({ ...prev, [taskId]: false }));
    }
  };

  const handleUpdateTaskQuantity = async (
    taskId: string,
    completedQty: number,
    totalQty: number,
    columnEmployeeName?: string
  ) => {
    if (!onToggleTaskComplete) return;
    if (columnEmployeeName && !isAdmin && !isManager) {
      const isMine = matchesEmployee(columnEmployeeName, user.name, user.email);
      if (!isMine) {
        return;
      }
    }
    setTogglingTaskIds((prev) => ({ ...prev, [taskId]: true }));
    try {
      const isFullyDone = completedQty >= totalQty;
      await onToggleTaskComplete(taskId, isFullyDone, completedQty, totalQty);
    } finally {
      setTogglingTaskIds((prev) => ({ ...prev, [taskId]: false }));
    }
  };

  const handleToggleAdminApprove = async (
    taskId: string,
    nextApproved: boolean,
    empName: string,
    taskTitle: string
  ) => {
    if (!onApproveTask || approvingTaskIds[taskId]) return;
    setApprovingTaskIds((prev) => ({ ...prev, [taskId]: true }));
    try {
      await onApproveTask(taskId, nextApproved);
    } finally {
      setApprovingTaskIds((prev) => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
    }
  };

  const isAdmin = user.role === 'admin';
  const isManager = user.role === 'manager';
  const canReorder = isAdmin || isManager;
  const canReorderColumns = isAdmin || isManager;
  const isEmployee = !isAdmin && !isManager;

  const [departmentFilter, setDepartmentFilter] = useState<string>('all');

  const todayString = new Date().toISOString().slice(0, 10);
  const isPastDate = Boolean(selectedDate && selectedDate < todayString);

  // If viewing a past date, hide and reset the Today filter
  useEffect(() => {
    if (isPastDate && taskFilter === 'given') {
      setTaskFilter('all');
    }
  }, [isPastDate, taskFilter]);

  const toggleTaskComments = (taskId: string) => {
    setOpenCommentsTaskIds((prev) => ({
      ...prev,
      [taskId]: !prev[taskId],
    }));
  };

  const handlePostComment = async (taskId: string) => {
    const text = (commentInputs[taskId] || '').trim();
    if (!text || !onAddComment) return;

    setIsSubmittingComment((prev) => ({ ...prev, [taskId]: true }));
    try {
      await onAddComment(taskId, text);
      setCommentInputs((prev) => ({ ...prev, [taskId]: '' }));
    } finally {
      setIsSubmittingComment((prev) => ({ ...prev, [taskId]: false }));
    }
  };

  const formatCommentTime = (isoString: string): string => {
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const columns = board?.columns || [];

  // Scoped visible columns based on role and department filter
  const visibleColumns = useMemo(() => {
    let list = columns.filter((col) => !['shreay', 'aa'].includes(col.employeeName.trim().toLowerCase()));

    // Requirement 4: An employee should be able to view their own task column and nobody else's
    if (isEmployee) {
      list = list.filter((col) => matchesEmployee(col.employeeName, user.name, user.email));
    }

    // Role Scoping: Managers see columns assigned to them, plus their own column to assign tasks to themselves
    if (isManager) {
      list = list.filter((col) => {
        const matchId =
          (col.managerId && col.managerId === user.id) ||
          Boolean(col.managerIds?.includes(user.id));
        const matchName =
          Boolean(col.managerNames && col.managerNames.some((m) => m.toLowerCase().trim() === user.name.toLowerCase().trim())) ||
          Boolean(col.managerName && col.managerName.toLowerCase().split(',').map((s) => s.trim()).includes(user.name.toLowerCase().trim())) ||
          Boolean(col.managerName && col.managerName.toLowerCase().includes(user.name.toLowerCase().trim()));
        const matchSelf = matchesEmployee(col.employeeName, user.name, user.email);
        return Boolean(matchId || matchName || matchSelf);
      });
    }

    // Requirement 1: Department-wise filter for Admin & Manager
    if ((isAdmin || isManager) && departmentFilter !== 'all') {
      list = list.filter(
        (col) => (col.department || 'General').toLowerCase() === departmentFilter.toLowerCase()
      );
    }

    // Sort strictly by sortOrder to honor upload layout and preserve column reshuffling
    list.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    // For managers: their own task column should appear first on the left most side, even if it is empty.
    if (isManager) {
      const myCols = list.filter((col) => matchesEmployee(col.employeeName, user.name, user.email));
      const otherCols = list.filter((col) => !matchesEmployee(col.employeeName, user.name, user.email));
      list = [...myCols, ...otherCols];
    }

    return list;
  }, [columns, isEmployee, isAdmin, isManager, user.id, user.name, user.email, departmentFilter]);

  const handleDepartmentChange = async (colId: string, department: string) => {
    try {
      const res = await api.updateColumnDepartment(colId, department);
      if (res?.board && onBoardUpdated) {
        onBoardUpdated(res.board);
      }
    } catch (err) {
      console.error('Failed to update department', err);
    }
  };

  // Compute filter counts across scoped columns
  const allTasksList = visibleColumns.flatMap((c) => c.tasks || []);
  const countAll = allTasksList.length;
  const countP1 = allTasksList.filter((t) => t.isP1).length;
  const countGiven = allTasksList.filter((t) => t.isGivenToday).length;
  const countCarried = allTasksList.filter((t) => t.isCarriedForward).length;
  const countFinished = allTasksList.filter((t) => t.completed).length;
  const countPending = allTasksList.filter((t) => !t.completed).length;

  // ================= COLUMN DRAG & DROP HANDLERS (ADMIN & MANAGER) =================
  const handleColumnDragStart = (e: React.DragEvent, colId: string) => {
    if (!canReorderColumns) return;
    if (isManager) {
      const col = visibleColumns.find((c) => c.id === colId);
      if (col && matchesEmployee(col.employeeName, user.name, user.email)) {
        return; // Manager's own column cannot be moved
      }
    }
    setDraggedColId(colId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `col:${colId}`);
  };

  const handleColumnDragOver = (e: React.DragEvent, targetColId: string) => {
    if (!canReorderColumns || !draggedColId || draggedColId === targetColId) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    let side: 'left' | 'right' = mouseX < rect.width / 2 ? 'left' : 'right';

    // If target is Manager's own column and user is Manager, don't allow dropping to the left of it
    if (isManager) {
      const targetCol = visibleColumns.find((c) => c.id === targetColId);
      if (targetCol && matchesEmployee(targetCol.employeeName, user.name, user.email) && side === 'left') {
        side = 'right';
      }
    }

    if (dragOverColDropTargetId !== targetColId || dragOverColSide !== side) {
      setDragOverColDropTargetId(targetColId);
      setDragOverColSide(side);
    }
  };

  const handleColumnDrop = async (targetColId: string) => {
    if (!canReorderColumns || !draggedColId || draggedColId === targetColId) {
      setDraggedColId(null);
      setDragOverColDropTargetId(null);
      setDragOverColSide(null);
      return;
    }

    const currentVisualCols = [...visibleColumns];
    const sourceIdx = currentVisualCols.findIndex((c) => c.id === draggedColId);
    if (sourceIdx === -1) {
      setDraggedColId(null);
      setDragOverColDropTargetId(null);
      setDragOverColSide(null);
      return;
    }

    const [movedCol] = currentVisualCols.splice(sourceIdx, 1);
    let targetIdx = currentVisualCols.findIndex((c) => c.id === targetColId);
    if (targetIdx === -1) {
      targetIdx = currentVisualCols.length;
    } else if (dragOverColSide === 'right') {
      targetIdx += 1;
    }

    currentVisualCols.splice(targetIdx, 0, movedCol);

    // Keep Manager's own column strictly leftmost if manager is rearranging
    if (isManager) {
      const myColIdx = currentVisualCols.findIndex((c) =>
        matchesEmployee(c.employeeName, user.name, user.email)
      );
      if (myColIdx > 0) {
        const [myCol] = currentVisualCols.splice(myColIdx, 1);
        currentVisualCols.unshift(myCol);
      }
    }

    currentVisualCols.forEach((col, idx) => {
      col.sortOrder = idx;
    });

    const nonVisibleCols = columns.filter((c) => !currentVisualCols.some((vc) => vc.id === c.id));
    nonVisibleCols.forEach((col, idx) => {
      col.sortOrder = currentVisualCols.length + idx;
    });

    const fullColumns = [...currentVisualCols, ...nonVisibleCols];

    setDraggedColId(null);
    setDragOverColDropTargetId(null);
    setDragOverColSide(null);

    await onReorder(fullColumns, selectedDate);
  };

  const handleColumnDragEnd = () => {
    setDraggedColId(null);
    setDragOverColDropTargetId(null);
    setDragOverColSide(null);
  };

  // Quick left/right nudge buttons for Admin & Manager
  const handleShiftColumn = async (colId: string, direction: 'left' | 'right') => {
    if (!canReorderColumns) return;
    const currentVisualCols = [...visibleColumns];
    const curIdx = currentVisualCols.findIndex((c) => c.id === colId);
    if (curIdx === -1) return;

    if (isManager && matchesEmployee(currentVisualCols[curIdx].employeeName, user.name, user.email)) {
      return; // Manager's own column cannot be moved
    }

    const newIdx = direction === 'left' ? curIdx - 1 : curIdx + 1;
    if (newIdx < 0 || newIdx >= currentVisualCols.length) return;

    // Prevent moving another column to the left of manager's own column
    if (isManager && newIdx === 0 && matchesEmployee(currentVisualCols[0].employeeName, user.name, user.email)) {
      return;
    }

    const [movedCol] = currentVisualCols.splice(curIdx, 1);
    currentVisualCols.splice(newIdx, 0, movedCol);

    if (isManager) {
      const myColIdx = currentVisualCols.findIndex((c) =>
        matchesEmployee(c.employeeName, user.name, user.email)
      );
      if (myColIdx > 0) {
        const [myCol] = currentVisualCols.splice(myColIdx, 1);
        currentVisualCols.unshift(myCol);
      }
    }

    currentVisualCols.forEach((col, idx) => {
      col.sortOrder = idx;
    });

    const nonVisibleCols = columns.filter((c) => !currentVisualCols.some((vc) => vc.id === c.id));
    nonVisibleCols.forEach((col, idx) => {
      col.sortOrder = currentVisualCols.length + idx;
    });

    const fullColumns = [...currentVisualCols, ...nonVisibleCols];
    await onReorder(fullColumns, selectedDate);
  };

  const handleGeneralDragOverCol = (e: React.DragEvent, colId: string) => {
    if (draggedColId) {
      handleColumnDragOver(e, colId);
    } else if (draggedTaskId) {
      handleDragOverCol(e, colId);
    }
  };

  const handleGeneralDropOnCol = async (colId: string) => {
    if (draggedColId) {
      await handleColumnDrop(colId);
    } else if (draggedTaskId) {
      await handleDropOnColumn(colId);
    }
  };

  // ================= DRAG & DROP HANDLERS =================
  const handleDragStart = (e: React.DragEvent, taskId: string, colId: string) => {
    if (!canReorder) return;
    setDraggedTaskId(taskId);
    setDraggedSourceColId(colId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
  };

  const handleDragOverCol = (e: React.DragEvent, colId: string) => {
    if (!canReorder || !draggedTaskId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColId !== colId) {
      setDragOverColId(colId);
    }
  };

  const handleDragOverTask = (e: React.DragEvent, taskId: string) => {
    if (draggedColId) {
      // Dragging a column - allow bubbling to column container
      return;
    }
    if (!canReorder || !draggedTaskId) return;
    e.preventDefault();
    e.stopPropagation();
    if (dragOverTaskId !== taskId) {
      setDragOverTaskId(taskId);
    }
  };

  const handleDropOnColumn = async (targetColId: string, targetTaskId?: string) => {
    if (!canReorder || !draggedTaskId || !draggedSourceColId) return;

    // Clone columns structure
    const updatedColumns: BoardColumn[] = columns.map((col) => ({
      ...col,
      tasks: [...col.tasks],
    }));

    const sourceCol = updatedColumns.find((c) => c.id === draggedSourceColId);
    const targetCol = updatedColumns.find((c) => c.id === targetColId);

    if (!sourceCol || !targetCol) return;

    // Find and remove task from source
    const taskIndex = sourceCol.tasks.findIndex((t) => t.id === draggedTaskId);
    if (taskIndex === -1) return;
    const [movedTask] = sourceCol.tasks.splice(taskIndex, 1);

    // Determine target index
    let insertIndex = targetCol.tasks.length;
    if (targetTaskId) {
      const targetIndex = targetCol.tasks.findIndex((t) => t.id === targetTaskId);
      if (targetIndex !== -1) {
        insertIndex = targetIndex;
      }
    }

    targetCol.tasks.splice(insertIndex, 0, movedTask);

    // Reset drag states
    setDraggedTaskId(null);
    setDraggedSourceColId(null);
    setDragOverColId(null);
    setDragOverTaskId(null);

    // Recalculate priority order numbers
    updatedColumns.forEach((col) => {
      col.tasks.forEach((t, i) => {
        t.order = i + 1;
      });
    });

    await onReorder(updatedColumns, selectedDate);
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setDraggedSourceColId(null);
    setDragOverColId(null);
    setDragOverTaskId(null);
  };

  const handleMoveTaskPriority = async (colId: string, taskId: string, direction: 'up' | 'down') => {
    if (!canReorder) return;
    const updatedColumns: BoardColumn[] = columns.map((col) => ({
      ...col,
      tasks: [...col.tasks],
    }));

    const col = updatedColumns.find((c) => c.id === colId);
    if (!col) return;

    const idx = col.tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= col.tasks.length) return;

    const temp = col.tasks[idx];
    col.tasks[idx] = col.tasks[targetIdx];
    col.tasks[targetIdx] = temp;

    updatedColumns.forEach((c) => {
      c.tasks.forEach((t, i) => {
        t.order = i + 1;
      });
    });

    await onReorder(updatedColumns, selectedDate);
  };

  // ================= ADMIN ACTIONS =================
  const saveTaskEdit = async (taskId: string) => {
    if (!editTaskText.trim()) return;
    await onAdminEdit(
      {
        type: 'edit_task',
        taskId,
        text: editTaskText.trim(),
      },
      selectedDate
    );
    setEditingTaskId(null);
  };

  const saveColEdit = async (columnId: string) => {
    if (!editColName.trim()) return;
    await onAdminEdit(
      {
        type: 'rename_column',
        columnId,
        name: editColName.trim(),
      },
      selectedDate
    );
    setEditingColId(null);
  };

  const saveNewTask = async (columnId: string) => {
    if (!newTaskText.trim()) return;
    await onAdminEdit(
      {
        type: 'add_task',
        columnId,
        text: newTaskText.trim(),
        assignedDate: selectedDate,
      },
      selectedDate
    );
    setNewTaskText('');
    setAddingTaskColId(null);
  };

  const saveNewColumn = async () => {
    if (!newColumnName.trim()) return;
    await onAdminEdit(
      {
        type: 'add_column',
        name: newColumnName.trim(),
      },
      selectedDate
    );
    setNewColumnName('');
    setIsAddingColumn(false);
  };

  // Column avatar colors based on name hash for visual distinction
  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-blue-600 text-white',
      'bg-emerald-600 text-white',
      'bg-indigo-600 text-white',
      'bg-violet-600 text-white',
      'bg-amber-600 text-white',
      'bg-rose-600 text-white',
      'bg-teal-600 text-white',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="flex-1 w-full max-w-full min-w-0 px-3 py-3 sm:px-6 sm:py-6 lg:p-8 bg-[#F8FAFC] text-slate-900">
      {/* Editorial Hero Banner Inspired by ARTmeTech */}
      <div className="w-full mb-3 sm:mb-6 bg-white border border-slate-200/90 rounded-2xl sm:rounded-3xl p-3.5 sm:p-8 shadow-xs relative overflow-hidden min-w-0">
        {/* Geometric curve motif in background */}
        <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full border border-slate-100 pointer-events-none" />
        <div className="absolute -top-36 -right-36 w-96 h-96 rounded-full border border-slate-100 pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full border border-slate-100 pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-3 sm:gap-6 min-w-0">
          <div className="max-w-2xl min-w-0">
            <div className="flex items-center gap-2 mb-1.5 sm:mb-3">
              <div className="sm:hidden inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold border border-slate-200">
                <ArrowUpDown className="w-2.5 h-2.5 text-[#2E2BE6]" />
                <span>Top = P1</span>
              </div>
            </div>

            <h1 className="font-display font-black text-lg sm:text-3xl lg:text-4xl text-[#0A0E2A] tracking-tight uppercase leading-tight break-words">
              AMT Task Tracker
            </h1>
            <p className="hidden sm:block text-xs sm:text-sm text-slate-500 mt-1 sm:mt-2 font-medium leading-relaxed">
              Tasklists converted directly into actionable team columns. The top task in each column is automatically prioritized as P1 with zero manual tagging required.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5 min-w-0">
            {/* Manage Visibility for Managers - Strictly Admin Only */}
            {isAdmin && (
              <button
                id="btn-manage-visibility"
                type="button"
                onClick={() => setIsAssignModalOpen(true)}
                className="flex items-center justify-center gap-1.5 text-[11px] sm:text-xs font-bold px-3 sm:px-4 py-1.5 sm:py-2 bg-indigo-50 hover:bg-indigo-100 text-[#2E2BE6] border border-indigo-200/90 rounded-full shadow-2xs transition-all cursor-pointer"
                title="Manage visibility of employee columns for managers"
              >
                <Eye className="w-3.5 h-3.5 text-[#2E2BE6]" />
                <span>Manage visibility</span>
              </button>
            )}

            {/* Monthly Performance & Changes Report - Strictly Admin Only */}
            {isAdmin && (
              <button
                id="btn-monthly-report"
                onClick={() => setIsReportModalOpen(true)}
                className="flex items-center justify-center gap-1.5 text-[11px] sm:text-xs font-bold px-3 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 text-white rounded-full shadow-xs transition-all cursor-pointer"
                title="Generate monthly report of carry-forwards and changes"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-purple-200" />
                <span>Monthly Report</span>
              </button>
            )}

            {isAdmin && (
              <>
                {!isPastDate && (
                  <button
                    id="btn-admin-add-column"
                    onClick={() => setIsAddingColumn(true)}
                    className="flex items-center justify-center gap-1 text-[11px] sm:text-xs font-bold px-3 sm:px-4 py-1.5 sm:py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-full shadow-2xs transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#2E2BE6]" />
                    <span>Add task column</span>
                  </button>
                )}
              </>
            )}
            {isAdmin && (
              <div className="hidden sm:inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-[#2E2BE6] font-semibold">
                <GripVertical className="w-3.5 h-3.5" />
                <span>Drag columns left / right to reshuffle</span>
              </div>
            )}
            <div className="hidden sm:flex items-center justify-center gap-1 text-xs px-4 py-2 rounded-full bg-slate-50 border border-slate-200 text-slate-700 font-semibold">
              <ArrowUpDown className="w-3.5 h-3.5 text-[#2E2BE6]" />
              <span>Top = P1</span>
            </div>
          </div>
        </div>

        {/* Global Filter Bar */}
        <div className="relative z-10 mt-2.5 pt-2 sm:mt-6 sm:pt-5 border-t border-slate-100 flex flex-col gap-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto pb-1 max-w-full scrollbar-none">
              <button
                id="filter-tasks-all"
                type="button"
                onClick={() => setTaskFilter('all')}
                className={`px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold transition-all shrink-0 ${
                  taskFilter === 'all'
                    ? 'bg-[#2E2BE6] text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                All ({countAll})
              </button>
              <button
                id="filter-tasks-p1"
                type="button"
                onClick={() => setTaskFilter('p1')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold transition-all shrink-0 ${
                  taskFilter === 'p1'
                    ? 'bg-[#2E2BE6] text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
                title="Show Top Priority tasks"
              >
                <span>Top Priority ({countP1})</span>
              </button>
              {!isPastDate && (
                <button
                  id="filter-tasks-given"
                  type="button"
                  onClick={() => setTaskFilter('given')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold transition-all shrink-0 ${
                    taskFilter === 'given'
                      ? 'bg-[#2E2BE6] text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                  title="Show tasks given on this selected date"
                >
                  <Calendar className="w-2.5 h-2.5 text-blue-500" />
                  <span>Today ({countGiven})</span>
                </button>
              )}
              <button
                id="filter-tasks-carried"
                type="button"
                onClick={() => setTaskFilter('carried')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold transition-all shrink-0 ${
                  taskFilter === 'carried'
                    ? 'bg-[#2E2BE6] text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
                title="Show tasks carried forward from previous days"
              >
                <ArrowRight className="w-2.5 h-2.5 text-amber-500" />
                <span>Roll ({countCarried})</span>
              </button>
              <button
                id="filter-tasks-pending"
                type="button"
                onClick={() => setTaskFilter('pending')}
                className={`px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold transition-all shrink-0 ${
                  taskFilter === 'pending'
                    ? 'bg-[#2E2BE6] text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                To-Do ({countPending})
              </button>
              <button
                id="filter-tasks-finished"
                type="button"
                onClick={() => setTaskFilter('finished')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold transition-all shrink-0 ${
                  taskFilter === 'finished'
                    ? 'bg-[#2E2BE6] text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Check className="w-2.5 h-2.5" />
                <span>Done ({countFinished})</span>
              </button>
            </div>

            <div className="text-[10px] sm:text-[11px] font-semibold text-slate-500">
              Drag cards to reorder priorities or check when done
            </div>
          </div>

          {/* Department-wise filter for Admin and Manager (Requirement 1) */}
          {(isAdmin || isManager) && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full scrollbar-none pt-2 border-t border-slate-100/80">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 shrink-0 mr-1 flex items-center gap-1">
                <Briefcase className="w-3 h-3 text-[#2E2BE6]" />
                Department:
              </span>
              {['all', 'Editors', 'Designers', 'Managers', 'Cinematographers'].map((dept) => {
                const isSelected = departmentFilter.toLowerCase() === dept.toLowerCase();
                const count =
                  dept === 'all'
                    ? columns.length
                    : columns.filter((c) => (c.department || 'General').toLowerCase() === dept.toLowerCase()).length;

                return (
                  <button
                    key={dept}
                    id={`filter-dept-${dept.toLowerCase()}`}
                    type="button"
                    onClick={() => setDepartmentFilter(dept)}
                    className={`px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold transition-all shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-[#0A0E2A] text-white shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {dept === 'all' ? 'All Departments' : dept} ({count})
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Manager Specific Scope Notice */}
      {isManager && (
        <div className="w-full mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/90 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#2E2BE6] text-white flex items-center justify-center shrink-0 shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-extrabold text-[#0A0E2A] uppercase tracking-wider flex items-center gap-2">
                <span>Manager Workspace: {user.name}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                  Assigned Team Scope
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Displaying only the team members assigned to you. You can reorder and assign their tasks
              </p>
            </div>
          </div>
          {board?.totalTeamColumnsCount && board.totalTeamColumnsCount > columns.length && (
            <div className="text-[11px] text-slate-500 font-medium shrink-0 bg-white/90 px-3 py-1.5 rounded-full border border-slate-200">
              {board.totalTeamColumnsCount - columns.length} other team member(s) assigned to other managers
            </div>
          )}
        </div>
      )}

      {/* 15-Day Date Navigator & Daily Carry-Forward Statistics */}
      <div className="w-full">
        <DateSelector
          selectedDate={selectedDate}
          availableDates={board?.availableDates}
          dailyStats={board?.dailyStats}
          onSelectDate={onSelectDate}
        />
      </div>

      {/* Admin Add Person Modal/Input */}
      {isAddingColumn && (
        <div className="w-full mb-6 bg-white border border-indigo-200 rounded-xl p-4 shadow-sm flex items-center gap-3">
          <input
            id="input-new-column-name"
            type="text"
            placeholder="Team member name..."
            value={newColumnName}
            onChange={(e) => setNewColumnName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveNewColumn()}
            autoFocus
            className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            id="btn-confirm-new-column"
            onClick={saveNewColumn}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg"
          >
            Add Column
          </button>
          <button
            onClick={() => {
              setIsAddingColumn(false);
              setNewColumnName('');
            }}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Columns Container */}
      <div className="flex items-start gap-3.5 sm:gap-6 overflow-x-auto pb-12 w-full min-w-0 snap-x sm:snap-none overscroll-x-contain">
        {visibleColumns.length === 0 ? (
          <div className="w-full bg-white border border-slate-200/90 rounded-2xl p-8 sm:p-12 text-center shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto mb-4 text-[#2E2BE6]">
              {columns.length === 0 ? <Camera className="w-7 h-7" /> : <Users className="w-7 h-7" />}
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900">
              {isEmployee
                ? "No Assigned Column Found"
                : isManager && columns.length === 0
                ? "No Team Members Assigned to You"
                : departmentFilter !== 'all'
                ? `No Team Members in "${departmentFilter}"`
                : isPastDate
                ? `No Columns Recorded for ${selectedDate}`
                : "No Columns on Today's Board"}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1.5 leading-relaxed">
              {isEmployee
                ? "Your account currently doesn't have an active personal column on this date. You can click on past dates in the timeline above to view your task history."
                : isManager && columns.length === 0
                ? `Hello ${user.name}. You are logged in as a Manager. There are currently no team members assigned to your profile on this date. Use the date navigator above to check previous dates or ask your Administrator to assign columns.`
                : departmentFilter !== 'all'
                ? `There are no columns currently assigned to the ${departmentFilter} department. Select "All Departments" to view all members.`
                : isPastDate
                ? `No taskboard columns or tasks were saved for ${selectedDate}. You can navigate to other dates above using the date timeline or calendar.`
                : "All columns have been removed from today's board. You can photograph or upload your tasklist to populate columns, add team members manually, or click any past date above to view previous taskboards."}
            </p>
            {departmentFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setDepartmentFilter('all')}
                className="mt-4 px-4 py-2 rounded-full bg-[#0A0E2A] text-white text-xs font-bold shadow-xs hover:bg-[#151a4a] transition-colors cursor-pointer"
              >
                View All Departments
              </button>
            )}
            {isAdmin && columns.length === 0 && (
              <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
                <button
                  id="btn-empty-upload-board"
                  type="button"
                  onClick={onOpenUpload}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#2E2BE6] hover:bg-[#201db3] text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>Upload Tasklist Photo</span>
                </button>
                <button
                  id="btn-empty-add-column"
                  type="button"
                  onClick={() => setIsAddingColumn(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 rounded-xl text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-[#2E2BE6]" />
                  <span>Add task column</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          visibleColumns.map((column, colIndex) => {
          const isOverThisCol = dragOverColId === column.id;
          const isColumnBeingDragged = draggedColId === column.id;
          const isColumnDropTarget = dragOverColDropTargetId === column.id;
          const isDropLeft = isColumnDropTarget && dragOverColSide === 'left';
          const isDropRight = isColumnDropTarget && dragOverColSide === 'right';

          const initials = column.employeeName
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);

          const isMyColumn = matchesEmployee(column.employeeName, user.name, user.email);
          const isManagerOwnColumn = isManager && isMyColumn;
          const isAssignedManager =
            isManager &&
            (column.managerId === user.id ||
              Boolean(column.managerIds?.includes(user.id)) ||
              Boolean(column.managerNames && column.managerNames.some((m) => m.toLowerCase().trim() === user.name.toLowerCase().trim())) ||
              Boolean(column.managerName && column.managerName.toLowerCase().split(',').map((s) => s.trim()).includes(user.name.toLowerCase().trim())) ||
              Boolean(column.managerName && column.managerName.toLowerCase().includes(user.name.toLowerCase().trim())));
          const canToggleThisColumn = isAdmin || isManager || isMyColumn || isAssignedManager;

          return (
            <div
              key={column.id}
              id={`column-${column.id}`}
              onDragOver={(e) => handleGeneralDragOverCol(e, column.id)}
              onDrop={() => handleGeneralDropOnCol(column.id)}
              className={`relative flex-shrink-0 w-[84vw] max-w-[340px] sm:w-80 rounded-2xl flex flex-col transition-all border snap-center sm:snap-align-none ${
                isColumnBeingDragged
                  ? 'opacity-35 scale-[0.98] border-dashed border-[#2E2BE6] ring-2 ring-indigo-300'
                  : isDropLeft
                  ? 'border-l-4 border-l-[#2E2BE6] ring-2 ring-indigo-300 bg-indigo-50/20'
                  : isDropRight
                  ? 'border-r-4 border-r-[#2E2BE6] ring-2 ring-indigo-300 bg-indigo-50/20'
                  : isOverThisCol
                  ? 'bg-indigo-50/40 border-indigo-300 ring-2 ring-indigo-200'
                  : 'bg-slate-100/90 border-slate-200/90 shadow-2xs'
              }`}
            >
              {/* Drop Indicator Lines for Column Reordering */}
              {isDropLeft && (
                <div className="absolute top-0 bottom-0 -left-1.5 w-1.5 bg-[#2E2BE6] rounded-full shadow-lg z-30 pointer-events-none animate-pulse" />
              )}
              {isDropRight && (
                <div className="absolute top-0 bottom-0 -right-1.5 w-1.5 bg-[#2E2BE6] rounded-full shadow-lg z-30 pointer-events-none animate-pulse" />
              )}
              {/* Column Header - Draggable for Admin & Manager (except manager's own column which is pinned to leftmost) */}
              <div
                draggable={canReorderColumns && !editingColId && !isManagerOwnColumn}
                onDragStart={(e) => {
                  if (isManagerOwnColumn) return;
                  const target = e.target as HTMLElement;
                  if (target.closest('button, input, textarea')) return;
                  handleColumnDragStart(e, column.id);
                }}
                onDragEnd={handleColumnDragEnd}
                className={`p-3 sm:p-3.5 border-b rounded-t-2xl flex flex-col gap-1.5 border-slate-200 bg-white select-none ${
                  canReorderColumns && !isManagerOwnColumn ? 'cursor-grab active:cursor-grabbing hover:bg-slate-50/80 transition-colors' : ''
                }`}
                title={canReorderColumns && !isManagerOwnColumn ? 'Drag column header left or right to reshuffle' : undefined}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
                    {canReorderColumns && !isManagerOwnColumn && (
                      <div
                        className="text-slate-400 hover:text-[#2E2BE6] transition-colors p-0.5 cursor-grab active:cursor-grabbing shrink-0 -ml-1"
                        title="Drag to reshuffle column left or right"
                      >
                        <GripVertical className="w-3.5 h-3.5" />
                      </div>
                    )}
                    <div
                      className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center font-bold text-[10px] sm:text-xs shrink-0 ${getAvatarColor(
                        column.employeeName
                      )}`}
                    >
                      {initials || '?'}
                    </div>

                    {editingColId === column.id ? (
                      <div className="flex items-center gap-1 flex-1">
                        <input
                          type="text"
                          value={editColName}
                          onChange={(e) => setEditColName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && saveColEdit(column.id)}
                          autoFocus
                          className="px-2 py-0.5 border border-indigo-400 rounded text-xs text-slate-900 w-full focus:outline-none"
                        />
                        <button
                          onClick={() => saveColEdit(column.id)}
                          className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingColId(null)}
                          className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <h3
                            className="font-bold truncate text-xs sm:text-sm text-slate-900"
                            title={column.employeeName}
                          >
                            {column.employeeName}
                          </h3>
                          {isMyColumn && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              You
                            </span>
                          )}
                          {isAdmin && (
                            <button
                              onClick={() => {
                                setEditingColId(column.id);
                                setEditColName(column.employeeName);
                              }}
                              className="opacity-0 group-hover:opacity-100 hover:opacity-100 p-0.5 text-slate-400 hover:text-slate-700"
                            >
                              <Edit2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                            </button>
                          )}
                        </div>
                        {(() => {
                          const columnManagers = getColumnManagers(column);
                          return columnManagers.length > 0 ? (
                            <div className="flex items-center gap-1 mt-0.5">
                              <span
                                title={columnManagers.length > 1 ? columnManagers.join(', ') : undefined}
                                className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100"
                              >
                                <ShieldCheck className="w-2.5 h-2.5 text-[#2E2BE6]" />
                                <span>Mgr: {getManagerBadgeLabel(columnManagers)}</span>
                              </span>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Reshuffle Left / Right Arrows (Admin & Manager) - Hidden on Manager's own column since it cannot be moved */}
                    {canReorderColumns && !isManagerOwnColumn && (
                      <div
                        className="flex items-center bg-slate-100 border border-slate-200/90 rounded-lg p-0.5"
                        title="Reshuffle column left or right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          id={`btn-shift-left-${column.id}`}
                          disabled={
                            colIndex === 0 ||
                            (isManager &&
                              colIndex === 1 &&
                              visibleColumns[0] &&
                              matchesEmployee(visibleColumns[0].employeeName, user.name, user.email))
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            handleShiftColumn(column.id, 'left');
                          }}
                          title="Move column left"
                          className="p-1 text-slate-500 hover:text-[#2E2BE6] hover:bg-white rounded transition-colors disabled:opacity-20 disabled:hover:text-slate-500 disabled:hover:bg-transparent cursor-pointer"
                        >
                          <ChevronLeft className="w-3 h-3 stroke-[2.5]" />
                        </button>
                        <button
                          type="button"
                          id={`btn-shift-right-${column.id}`}
                          disabled={colIndex === visibleColumns.length - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleShiftColumn(column.id, 'right');
                          }}
                          title="Move column right"
                          className="p-1 text-slate-500 hover:text-[#2E2BE6] hover:bg-white rounded transition-colors disabled:opacity-20 disabled:hover:text-slate-500 disabled:hover:bg-transparent cursor-pointer"
                        >
                          <ChevronRight className="w-3 h-3 stroke-[2.5]" />
                        </button>
                      </div>
                    )}

                    {(() => {
                      // Count units, not cards: "Chhedas x 2" is two items of work.
                      const unitCounts = column.tasks.map((t) => getTaskUnits(t));
                      const completedCount = unitCounts.reduce((sum, u) => sum + u.done, 0);
                      const totalCount = unitCounts.reduce((sum, u) => sum + u.total, 0);
                      return (
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-bold border transition-colors ${
                            completedCount > 0 && completedCount === totalCount
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : completedCount > 0
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                          title={`${completedCount} of ${totalCount} items finished`}
                        >
                          {completedCount > 0 ? `${completedCount}/${totalCount} done` : totalCount}
                        </span>
                      );
                    })()}



                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setColumnToClear({ id: column.id, name: column.employeeName });
                        }}
                        title={`Clear all tasks for ${column.employeeName}`}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Department Badge */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[10px]">
                  <span className="text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1">
                    <Briefcase className="w-2.5 h-2.5 text-[#2E2BE6]" />
                    Dept:
                  </span>
                  <span className="font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                    {column.department || 'General'}
                  </span>
                </div>
              </div>

              {/* Tasks List */}
              <div className="p-3 flex flex-col gap-2 min-h-64 flex-1">
                {(() => {
                  const displayedTasks = column.tasks.filter((t) => {
                    if (taskFilter === 'p1') return Boolean(t.isP1);
                    if (taskFilter === 'given') return Boolean(t.isGivenToday);
                    if (taskFilter === 'carried') return Boolean(t.isCarriedForward);
                    if (taskFilter === 'pending') return !t.completed;
                    if (taskFilter === 'finished') return Boolean(t.completed);
                    return true;
                  });

                  if (displayedTasks.length === 0) {
                    return (
                      <div className="h-28 border border-dashed border-slate-300 text-slate-400 rounded-xl flex flex-col items-center justify-center p-3 text-center gap-2">
                        <p className="text-xs">
                          {taskFilter === 'p1'
                            ? 'No P1 tasks for this person'
                            : taskFilter === 'given'
                            ? 'No tasks assigned on this date'
                            : taskFilter === 'carried'
                            ? 'No carried-forward tasks'
                            : taskFilter === 'pending' && column.tasks.length > 0
                            ? 'All tasks finished!'
                            : taskFilter === 'finished'
                            ? 'No finished tasks yet'
                            : 'No tasks'}
                        </p>
                        {isMyColumn && (
                          <button
                            type="button"
                            onClick={() => {
                              setAddingTaskColId(column.id);
                              setNewTaskText('');
                            }}
                            className="px-2.5 py-1 text-xs font-bold text-[#2E2BE6] bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add task for myself</span>
                          </button>
                        )}
                      </div>
                    );
                  }

                  return displayedTasks.map((task, idx) => {
                    const isTopPriority = idx === 0 && !task.completed;
                    const isDragging = draggedTaskId === task.id;
                    const isOverThisTask = dragOverTaskId === task.id;

                    return (
                      <div
                        key={task.id}
                        id={`task-${task.id}`}
                        draggable={canReorder && !isTouchDevice}
                        onDragStart={(e) => handleDragStart(e, task.id, column.id)}
                        onDragOver={(e) => handleDragOverTask(e, task.id)}
                        onDrop={(e) => {
                          if (draggedColId) {
                            // Column drag in progress - let it bubble to column container
                            return;
                          }
                          e.stopPropagation();
                          handleDropOnColumn(column.id, task.id);
                        }}
                        onDragEnd={handleDragEnd}
                        className={`group relative rounded-xl sm:rounded-2xl border transition-all p-2 sm:p-3.5 select-none touch-manipulation ${
                          task.completed
                            ? 'bg-slate-50/80 border-slate-200 text-slate-400'
                            : isTopPriority
                            ? 'bg-white border-slate-300 shadow-sm ring-1 ring-slate-200/80'
                            : 'bg-white border-slate-200/90 shadow-2xs hover:border-slate-300'
                        } ${isDragging ? 'opacity-40 scale-95 border-dashed border-[#2E2BE6]' : ''} ${
                          isOverThisTask ? 'border-t-2 border-t-[#2E2BE6]' : ''
                        } ${canReorder && !isTouchDevice ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
                      >
                        {/* Status Tags & Admin Controls */}
                        <div className="flex items-center justify-between mb-1 sm:mb-1.5">
                          <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                            {/* Finished Tag */}
                            {task.completed ? (
                              <span className="inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                                <Check className="w-2.5 h-2.5 sm:w-3 sm:h-3 stroke-[3]" />
                                <span>{task.totalQuantity && task.totalQuantity > 1 ? `Finished (${task.totalQuantity}/${task.totalQuantity})` : 'Finished'}</span>
                              </span>
                            ) : (task.completedQuantity || 0) > 0 ? (
                              <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                <span>{task.completedQuantity}/{task.totalQuantity} Done</span>
                              </span>
                            ) : null}

                            {/* Carried Forward from Prior Day Tag */}
                            {task.isCarriedForward && (
                              <span
                                id={`badge-carried-${task.id}`}
                                className="inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-200"
                                title={`Unfinished from ${task.originalAssignedDate} — carried forward to this day`}
                              >
                                <ArrowRight className="w-2 h-2 sm:w-2.5 sm:h-2.5 text-amber-600" />
                                <span>From {task.originalAssignedDate ? task.originalAssignedDate.slice(5) : 'prior day'}</span>
                              </span>
                            )}

                            {/* Given on This Date Tag */}
                            {task.isGivenToday && (
                              <span
                                id={`badge-given-${task.id}`}
                                className="inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200"
                                title={`Assigned on ${task.originalAssignedDate || selectedDate}`}
                              >
                                <Calendar className="w-2 h-2 sm:w-2.5 sm:h-2.5 text-blue-600" />
                                <span>{isPastDate ? 'Assigned' : 'Today'}</span>
                              </span>
                            )}


                          </div>

                          {/* Reorder grip indicator & admin controls */}
                          <div className="flex items-center gap-1">
                            {canReorder && (
                              <>
                                <div className="flex items-center gap-0.5 sm:hidden">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleMoveTaskPriority(column.id, task.id, 'up');
                                    }}
                                    disabled={idx === 0}
                                    title="Move Task Up (Top is P1)"
                                    className={`p-1 rounded ${
                                      idx === 0
                                        ? 'text-slate-200 cursor-not-allowed'
                                        : 'text-slate-500 hover:text-slate-900 active:bg-slate-200 cursor-pointer'
                                    }`}
                                  >
                                    <ChevronUp className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleMoveTaskPriority(column.id, task.id, 'down');
                                    }}
                                    disabled={idx === displayedTasks.length - 1}
                                    title="Move Task Down"
                                    className={`p-1 rounded ${
                                      idx === displayedTasks.length - 1
                                        ? 'text-slate-200 cursor-not-allowed'
                                        : 'text-slate-500 hover:text-slate-900 active:bg-slate-200 cursor-pointer'
                                    }`}
                                  >
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <GripVertical className="hidden sm:block w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500" />
                              </>
                            )}

                            {isAdmin && (
                              <div className="flex sm:hidden group-hover:flex items-center gap-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingTaskId(task.id);
                                    setEditTaskText(task.text);
                                  }}
                                  title="Edit task"
                                  className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onAdminEdit({ type: 'delete_task', taskId: task.id }, selectedDate);
                                  }}
                                  title="Delete task"
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Interactive Checkbox + Task Text */}
                        <div className="flex items-start gap-2.5 my-1">
                          <button
                            type="button"
                            id={`btn-check-task-${task.id}`}
                            disabled={!canToggleThisColumn || Boolean(togglingTaskIds[task.id])}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!canToggleThisColumn) return;
                              if (task.totalQuantity && task.totalQuantity > 1) {
                                if (task.completed) {
                                  handleUpdateTaskQuantity(task.id, 0, task.totalQuantity, column.employeeName);
                                } else {
                                  handleUpdateTaskQuantity(task.id, task.totalQuantity, task.totalQuantity, column.employeeName);
                                }
                              } else {
                                handleToggleTask(task.id, !task.completed, column.employeeName);
                              }
                            }}
                            className={`mt-0.5 w-4 h-4 sm:w-5 sm:h-5 rounded border flex items-center justify-center transition-all flex-shrink-0 ${
                              !canToggleThisColumn
                                ? task.completed
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-600/80 cursor-default opacity-80'
                                  : (task.completedQuantity || 0) > 0
                                  ? 'bg-amber-50 border-amber-300 text-amber-600/80 cursor-default opacity-80'
                                  : 'bg-slate-100/80 border-slate-200 text-slate-300 cursor-not-allowed opacity-50'
                                : task.completed
                                ? 'bg-emerald-600 border-emerald-600 text-white shadow-2xs ring-1 ring-emerald-500/20 cursor-pointer hover:bg-emerald-700'
                                : (task.completedQuantity || 0) > 0
                                ? 'bg-amber-50 border-amber-500 text-amber-700 shadow-2xs ring-1 ring-amber-400/20 cursor-pointer hover:bg-amber-100'
                                : 'bg-white border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/40 text-transparent hover:text-emerald-500/50 cursor-pointer'
                            } ${togglingTaskIds[task.id] ? 'opacity-40 cursor-wait' : ''}`}
                            title={
                              !canToggleThisColumn
                                ? task.completed
                                  ? `Finished (only ${column.employeeName} can change this)`
                                  : (task.completedQuantity || 0) > 0
                                  ? `Partially finished: ${task.completedQuantity} of ${task.totalQuantity} items`
                                  : `Assigned to ${column.employeeName} (only they can tick this task)`
                                : task.completed
                                ? `Mark as in progress`
                                : task.totalQuantity && task.totalQuantity > 1 && (task.completedQuantity || 0) > 0
                                ? `Partially finished (${task.completedQuantity}/${task.totalQuantity}). Click to finish all.`
                                : 'Check task as finished'
                            }
                          >
                            {task.completed ? (
                              <Check className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 stroke-[2.5]" />
                            ) : (task.completedQuantity || 0) > 0 ? (
                              <span className="w-2 h-0.5 bg-amber-600 rounded-full" />
                            ) : (
                              <Check
                                className={`w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 stroke-[2.5] ${
                                   !canToggleThisColumn && !task.completed ? 'hidden' : ''
                                }`}
                              />
                            )}
                          </button>

                          {/* Checkbox 2: Blue Admin Approval Checkbox (Only available to Admin) */}
                          {isAdmin && (
                            <button
                              type="button"
                              id={`btn-admin-approve-${task.id}`}
                              aria-label="Admin approve task"
                              disabled={Boolean(approvingTaskIds[task.id])}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleAdminApprove(task.id, !task.adminApproved, column.employeeName, task.text);
                              }}
                              className={`mt-0.5 w-4 h-4 sm:w-5 sm:h-5 rounded border flex items-center justify-center transition-all flex-shrink-0 cursor-pointer ${
                                task.adminApproved
                                  ? 'bg-blue-600 border-blue-600 text-white shadow-xs ring-1 ring-blue-500/30 hover:bg-blue-700'
                                  : 'bg-white border-blue-400 hover:border-blue-600 hover:bg-blue-50/60 text-transparent hover:text-blue-500/40'
                              } ${approvingTaskIds[task.id] ? 'opacity-40 cursor-wait' : ''}`}
                              title={
                                task.adminApproved
                                  ? 'Admin approved (click to revoke approval)'
                                  : 'Approve task (Admin approval)'
                              }
                            >
                              <Check
                                className={`w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 stroke-[2.5] ${
                                  !task.adminApproved ? 'opacity-0 hover:opacity-100 text-blue-500' : ''
                                }`}
                              />
                            </button>
                          )}

                          <div className="flex-1 min-w-0">
                            {editingTaskId === task.id ? (
                              <div className="flex flex-col gap-1.5">
                                <textarea
                                  value={editTaskText}
                                  onChange={(e) => setEditTaskText(e.target.value)}
                                  rows={2}
                                  autoFocus
                                  className="w-full p-1.5 text-xs border border-indigo-400 rounded focus:outline-none text-slate-900 bg-white"
                                />
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => saveTaskEdit(task.id)}
                                    className="px-2 py-0.5 bg-indigo-600 text-white rounded text-[11px] font-semibold"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setEditingTaskId(null)}
                                    className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px]"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col">
                                <p
                                  className={`leading-relaxed whitespace-pre-wrap text-[11px] sm:text-xs ${
                                    task.completed
                                      ? 'line-through text-slate-400 font-normal'
                                      : 'font-medium text-slate-800'
                                  }`}
                                >
                                  {task.text}
                                </p>
                                {task.adminApproved && (
                                  <div className="mt-1 flex items-center">
                                    <span
                                      id={`badge-admin-approved-${task.id}`}
                                      data-testid="admin-approved-label"
                                      aria-label="Admin Approved"
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 shrink-0 shadow-2xs"
                                      title={`Approved by Admin${task.adminApprovedBy ? ` (${task.adminApprovedBy})` : ''}`}
                                    >
                                      <CheckCircle2 className="w-2.5 h-2.5 text-blue-600" />
                                      <span>Admin Approved</span>
                                      <span className="sr-only"> (Admin Appoved)</span>
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Multi-Unit Quantity Sub-Counter Control (e.g. x2, x3, etc.) */}
                            {task.totalQuantity && task.totalQuantity > 1 && (
                              <div className="mt-2 pt-2 border-t border-slate-100 flex flex-col gap-1.5">
                                <div className="flex items-center justify-between text-[11px]">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-[9px] uppercase tracking-wider text-slate-400">
                                      Units:
                                    </span>
                                    <span
                                      className={`font-black text-[10px] px-1.5 py-0.5 rounded-full border ${
                                        (task.completedQuantity || 0) >= task.totalQuantity
                                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                          : (task.completedQuantity || 0) > 0
                                          ? 'bg-amber-100 text-amber-800 border-amber-200'
                                          : 'bg-slate-100 text-slate-600 border-slate-200'
                                      }`}
                                    >
                                      {task.completedQuantity || 0} / {task.totalQuantity} Done
                                    </span>
                                  </div>

                                  {canToggleThisColumn && (
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        disabled={!task.completedQuantity || task.completedQuantity <= 0 || Boolean(togglingTaskIds[task.id])}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const newQty = Math.max(0, (task.completedQuantity || 0) - 1);
                                          handleUpdateTaskQuantity(task.id, newQty, task.totalQuantity!, column.employeeName);
                                        }}
                                        title="Undo 1 unit"
                                        className="w-5 h-5 rounded flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed font-black text-xs transition-colors cursor-pointer select-none"
                                      >
                                        -
                                      </button>
                                      <button
                                        type="button"
                                        disabled={(task.completedQuantity || 0) >= task.totalQuantity || Boolean(togglingTaskIds[task.id])}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const newQty = Math.min(task.totalQuantity!, (task.completedQuantity || 0) + 1);
                                          handleUpdateTaskQuantity(task.id, newQty, task.totalQuantity!, column.employeeName);
                                        }}
                                        title="Complete 1 unit"
                                        className="w-5 h-5 rounded flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 text-[#2E2BE6] disabled:opacity-30 disabled:cursor-not-allowed font-black text-xs transition-colors cursor-pointer select-none"
                                      >
                                        +
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* Clickable Unit Pills */}
                                <div className="flex items-center gap-1 flex-wrap">
                                  {Array.from({ length: task.totalQuantity }).map((_, uIdx) => {
                                    const unitNumber = uIdx + 1;
                                    const isUnitDone = (task.completedQuantity || 0) >= unitNumber;
                                    return (
                                      <button
                                        key={uIdx}
                                        type="button"
                                        disabled={!canToggleThisColumn || Boolean(togglingTaskIds[task.id])}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (!canToggleThisColumn) return;
                                          const newQty = (task.completedQuantity || 0) === unitNumber ? unitNumber - 1 : unitNumber;
                                          handleUpdateTaskQuantity(task.id, newQty, task.totalQuantity!, column.employeeName);
                                        }}
                                        title={
                                          canToggleThisColumn
                                            ? `Click to mark unit #${unitNumber} ${isUnitDone ? 'incomplete' : 'done'}`
                                            : `Unit #${unitNumber}`
                                        }
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition-all ${
                                          isUnitDone
                                            ? 'bg-emerald-600 text-white shadow-2xs hover:bg-emerald-700'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200/80'
                                        } ${canToggleThisColumn ? 'cursor-pointer' : 'cursor-default'}`}
                                      >
                                        {isUnitDone ? (
                                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                                        ) : (
                                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                        )}
                                        <span>#{unitNumber}</span>
                                      </button>
                                    );
                                  })}
                                </div>

                                {/* Visual Mini Progress Bar */}
                                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-0.5">
                                  <div
                                    className={`h-full transition-all duration-300 ${
                                      (task.completedQuantity || 0) >= task.totalQuantity ? 'bg-emerald-500' : 'bg-[#2E2BE6]'
                                    }`}
                                    style={{
                                      width: `${Math.round(((task.completedQuantity || 0) / task.totalQuantity) * 100)}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Task Comments Footer & Expandable Discussion */}
                        {(() => {
                          const isCommentsOpen = Boolean(openCommentsTaskIds[task.id]);
                          const comments = task.comments || [];
                          const commentCount = comments.length;
                          const canComment = Boolean(onAddComment);

                          return (
                            <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                              <div className="flex items-center justify-between">
                                <button
                                  id={`btn-toggle-comments-${task.id}`}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleTaskComments(task.id);
                                  }}
                                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                                    isCommentsOpen
                                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                      : commentCount > 0
                                      ? 'bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-600'
                                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                                  }`}
                                  title={
                                    canComment
                                      ? 'View or add comments'
                                      : 'View comments'
                                  }
                                >
                                  <MessageSquare className="w-3.5 h-3.5 text-indigo-500" />
                                  <span>
                                    {commentCount > 0
                                      ? `${commentCount} ${commentCount === 1 ? 'comment' : 'comments'}`
                                      : canComment
                                      ? 'Add comment'
                                      : '0 comments'}
                                  </span>
                                </button>

                                {commentCount > 0 && !isCommentsOpen && (
                                  <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                                    Latest by {comments[comments.length - 1].userName.split(' ')[0]}
                                  </span>
                                )}
                              </div>

                              {/* Expanded Comments Thread */}
                              {isCommentsOpen && (
                                <div
                                  className="mt-2.5 pt-2 border-t border-slate-200/80 dark:border-slate-800 flex flex-col gap-2"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {/* Comments list */}
                                  {comments.length > 0 ? (
                                    <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
                                      {comments.map((c) => (
                                        <div
                                          key={c.id}
                                          className="p-2 rounded-lg text-xs border bg-slate-50 border-slate-200 text-slate-700"
                                        >
                                          <div className="flex items-center justify-between mb-1 gap-1">
                                            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                              <span className="font-semibold text-slate-900 dark:text-slate-100 text-[11px] truncate">
                                                {c.userName}
                                              </span>
                                              <span
                                                className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded border ${
                                                  c.userRole === 'admin'
                                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                                    : c.userRole === 'manager'
                                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                }`}
                                              >
                                                {c.userRole === 'employee' ? 'Team Member' : c.userRole}
                                              </span>
                                              <span className="text-[10px] text-slate-400">
                                                {formatCommentTime(c.createdAt)}
                                              </span>
                                            </div>

                                            {(canComment || c.userId === user.id) && onDeleteComment && (
                                              <button
                                                type="button"
                                                onClick={() => onDeleteComment(task.id, c.id)}
                                                title="Delete comment"
                                                className="text-slate-400 hover:text-rose-600 p-0.5 rounded transition-colors flex-shrink-0"
                                              >
                                                <Trash2 className="w-3 h-3" />
                                              </button>
                                            )}
                                          </div>
                                          <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-slate-800 dark:text-slate-200">
                                            {c.content}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="text-[11px] text-slate-400 italic py-1 text-center bg-slate-50/50 rounded">
                                      No comments yet on this task.
                                    </div>
                                  )}

                                  {/* Add comment input for Admin & Manager */}
                                  {canComment ? (
                                    <div className="flex flex-col gap-1.5 mt-1">
                                      <textarea
                                        id={`input-comment-${task.id}`}
                                        rows={2}
                                        value={commentInputs[task.id] || ''}
                                        onChange={(e) =>
                                          setCommentInputs((prev) => ({
                                            ...prev,
                                            [task.id]: e.target.value,
                                          }))
                                        }
                                        placeholder="Add a comment or priority update..."
                                        className="w-full p-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-slate-900"
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                            handlePostComment(task.id);
                                          }
                                        }}
                                      />
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-slate-400">
                                          {user.role === 'admin'
                                            ? 'Admin note'
                                            : user.role === 'manager'
                                            ? 'Manager note'
                                            : 'Team Member comment'}{' '}
                                          • Ctrl+Enter to send
                                        </span>
                                        <button
                                          id={`btn-post-comment-${task.id}`}
                                          type="button"
                                          onClick={() => handlePostComment(task.id)}
                                          disabled={
                                            !commentInputs[task.id]?.trim() ||
                                            isSubmittingComment[task.id]
                                          }
                                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold shadow-2xs transition-colors ${
                                            !commentInputs[task.id]?.trim() ||
                                            isSubmittingComment[task.id]
                                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                              : 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
                                          }`}
                                        >
                                          <Send className="w-3 h-3" />
                                          <span>
                                            {isSubmittingComment[task.id]
                                              ? 'Posting...'
                                              : 'Post Comment'}
                                          </span>
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="p-2 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-500 flex items-center gap-1.5">
                                      <Lock className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                      <span>Comments are open to Managers and Admins for coordination.</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  });
                })()}

                {/* Add Task Form / Button at Bottom of Column (Admin, Manager, or Employee on their own column) */}
                {(isAdmin || isManager || isMyColumn) && (
                  addingTaskColId === column.id ? (
                    <div className="mt-2 pt-2 border-t border-slate-200/60">
                      <div className="flex flex-col gap-1.5 bg-white p-2 rounded-lg border border-indigo-200">
                        <textarea
                          placeholder={isMyColumn && !isAdmin && !isManager ? "Add a task for yourself..." : "Type new task..."}
                          value={newTaskText}
                          onChange={(e) => setNewTaskText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              saveNewTask(column.id);
                            }
                          }}
                          rows={2}
                          autoFocus
                          className="w-full p-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-900"
                        />
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => saveNewTask(column.id)}
                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[11px] font-semibold cursor-pointer"
                          >
                            Add Task
                          </button>
                          <button
                            onClick={() => {
                              setAddingTaskColId(null);
                              setNewTaskText('');
                            }}
                            className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[11px] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 pt-2 border-t border-slate-200/60">
                      <button
                        type="button"
                        id={`btn-add-task-bottom-${column.id}`}
                        onClick={() => {
                          setAddingTaskColId(column.id);
                          setNewTaskText('');
                        }}
                        title={isMyColumn ? "Add task for yourself" : `Add task to ${column.employeeName}`}
                        className="w-full py-2 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-[#2E2BE6] text-xs font-bold flex items-center justify-center gap-1.5 border border-indigo-200 transition-colors cursor-pointer shadow-2xs"
                      >
                        <Plus className="w-4 h-4 stroke-[2.5]" />
                        <span>{isMyColumn && !isAdmin && !isManager ? 'Add My Task' : 'Add Task'}</span>
                      </button>
                    </div>
                  )
                )}
              </div>
            </div>
          );
        }))}
      </div>

      {/* Admin Manager Assignment Modal */}
      {isAdmin && (
        <ManagerAssignmentModal
          isOpen={isAssignModalOpen}
          onClose={() => setIsAssignModalOpen(false)}
          columns={columns}
          selectedDate={selectedDate}
          onAssignmentsUpdated={(updatedBoard) => {
            if (onBoardUpdated) {
              onBoardUpdated(updatedBoard);
            }
          }}
        />
      )}

      {/* Monthly Performance & Changes Report Modal */}
      <MonthlyReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        initialMonth={selectedDate.slice(0, 7)}
      />

      {/* Clear Column Tasks Confirmation Modal */}
      {columnToClear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-2">
              Clear tasks for {columnToClear.name}?
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 mb-6 leading-relaxed">
              Are you sure you want to remove all tasks from <strong>{columnToClear.name}</strong>'s column for <strong>{selectedDate}</strong>? The employee column will remain on the board.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setColumnToClear(null)}
                disabled={isClearingColumnTasks}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setIsClearingColumnTasks(true);
                  try {
                    await onAdminEdit(
                      { type: 'delete_column', columnId: columnToClear.id, name: columnToClear.name, assignedDate: selectedDate },
                      selectedDate
                    );
                    setColumnToClear(null);
                  } catch (err) {
                    console.error('Failed to clear column tasks', err);
                  } finally {
                    setIsClearingColumnTasks(false);
                  }
                }}
                disabled={isClearingColumnTasks}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-all shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {isClearingColumnTasks ? 'Clearing...' : 'Clear Tasks'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showDeleteDayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-2">
              Delete Tasks & Columns for {selectedDate}?
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 mb-6 leading-relaxed">
              Are you sure you want to delete all task columns and tasks for <strong>{selectedDate}</strong>? This will remove tasks and columns for this specific day only and will not affect any other days.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteDayModal(false)}
                disabled={isDeletingDay}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteDayTasks}
                disabled={isDeletingDay}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-all shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {isDeletingDay ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}



      {/* Floating Scroll to Top Button (especially useful on mobile touch screens) */}
      {showScrollTop && (
        <button
          type="button"
          id="btn-scroll-to-top"
          onClick={scrollToTop}
          aria-label="Scroll back to top"
          className="fixed bottom-6 right-5 z-40 p-3 rounded-full bg-[#0A0E2A] text-white shadow-xl hover:bg-[#1E2356] active:scale-95 transition-all border border-slate-700/50 flex items-center justify-center cursor-pointer animate-fadeIn"
        >
          <ChevronUp className="w-5 h-5 text-white stroke-[2.5]" />
        </button>
      )}
    </div>
  );
};
