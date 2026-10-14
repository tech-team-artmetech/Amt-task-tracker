import React, { useState, useEffect, useCallback } from 'react';
import { api, getToken } from './api';
import { User, BoardData, BoardColumn } from './types';
import { Navbar } from './components/Navbar';
import { BoardView } from './components/BoardView';
import { UploadModal } from './components/UploadModal';
import { ReviewScreen } from './components/ReviewScreen';
import { LoginModal } from './components/LoginModal';
import { UserManagementModal } from './components/UserManagementModal';
import { NotificationBanner } from './components/NotificationBanner';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const [board, setBoard] = useState<BoardData | null>(null);
  const [isBoardLoading, setIsBoardLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Upload modal state
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  // Team & User Management Modal (Admin only)
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);

  // Manager Assignment & Report modal states
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  // Review screen state (Admin has extracted image and is reviewing before publish)
  const [pendingExtraction, setPendingExtraction] = useState<{
    employees: Array<{
      name: string;
      originalExtractedName?: string;
      matchedName?: string;
      tasks: string[];
    }>;
    imagePreview: string | null;
    targetDate?: string;
    autoMatchedCount?: number;
  } | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  // Selected date for board historical view and carry-forwards
  const [selectedDate, setSelectedDate] = useState<string>('');

  // Error toast or notice
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'error' | 'success' | 'info' } | null>(
    null
  );

  const showToast = (text: string, type: 'error' | 'success' | 'info' = 'error') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Initial user check: do not auto-login; check if user has an active session
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      try {
        const token = getToken();
        if (token) {
          try {
            const meRes = await api.getMe();
            if (isMounted) {
              setCurrentUser(meRes.user);
              setIsAuthLoading(false);
              return;
            }
          } catch (e) {
            console.warn('Existing token invalid or expired:', e);
            api.logout();
          }
        }
        // No stored session or token expired: ensure token is cleared so user starts on Login screen
        api.logout();
        if (isMounted) {
          setCurrentUser(null);
        }
      } catch (err) {
        console.error('Failed to initialize session:', err);
      } finally {
        if (isMounted) {
          setIsAuthLoading(false);
        }
      }
    }

    initAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  // Listen for session expiration events
  useEffect(() => {
    const handleAuthExpired = (e: any) => {
      if (!isUploadOpen) {
        api.logout();
        setCurrentUser(null);
        setPendingExtraction(null);
        showToast(e.detail || 'Invalid or expired session. Please log in again.', 'error');
      }
    };

    window.addEventListener('auth:expired', handleAuthExpired);
    return () => window.removeEventListener('auth:expired', handleAuthExpired);
  }, [isUploadOpen]);

  // Fetch board data when user is authenticated
  const fetchBoard = useCallback(async (silent = false, dateToFetch?: string) => {
    if (!silent) setIsBoardLoading(true);
    setIsRefreshing(true);
    try {
      const activeDate = dateToFetch !== undefined ? dateToFetch : selectedDate;
      const data = await api.getBoard(activeDate || undefined);
      setBoard(data);
      if (data.currentDate && (!selectedDate || dateToFetch !== undefined)) {
        setSelectedDate(data.currentDate);
      }
    } catch (err: any) {
      console.warn('[Board Load Warning]', err);
      if (!silent) {
        showToast(err.message || 'Failed to load board data', 'error');
      }
    } finally {
      if (!silent) setIsBoardLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    if (currentUser) {
      fetchBoard();
    }
  }, [currentUser]);

  // Fast periodic polling for live wall screen mode and real-time syncing (every 4 seconds)
  useEffect(() => {
    if (!currentUser || pendingExtraction || isUploadOpen || isUserManagementOpen || isAssignModalOpen || isReportModalOpen) return;

    const interval = setInterval(() => {
      fetchBoard(true);
    }, 4000);

    return () => clearInterval(interval);
  }, [currentUser, pendingExtraction, isUploadOpen, isUserManagementOpen, isAssignModalOpen, isReportModalOpen, fetchBoard]);

  const handleLiveRefreshBoard = useCallback(() => {
    fetchBoard(true);
  }, [fetchBoard]);

  // Handlers
  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    setPendingExtraction(null);
  };

  const handleLogout = () => {
    api.logout();
    setCurrentUser(null);
    setBoard(null);
    setPendingExtraction(null);
  };

  const handleSelectDate = async (newDate: string) => {
    setSelectedDate(newDate);
    await fetchBoard(false, newDate);
  };

  // Drag and drop reordering
  const handleReorder = async (updatedColumns: BoardColumn[], date?: string) => {
    const targetDate = date || selectedDate || undefined;
    // Optimistic local update
    setBoard((prev) => (prev ? { ...prev, columns: updatedColumns } : null));

    try {
      const res = await api.reorderBoard(updatedColumns, targetDate);
      setBoard(res.board);
    } catch (err: any) {
      console.error('Reorder error', err);
      showToast(err.message || 'Failed to update order', 'error');
      // Revert from server
      await fetchBoard(true, targetDate);
    }
  };

  // Admin inline edits
  const handleAdminEdit = async (
    action: {
      type: 'rename_column' | 'add_column' | 'delete_column' | 'add_task' | 'edit_task' | 'delete_task' | 'delete_day_tasks';
      columnId?: string;
      taskId?: string;
      name?: string;
      text?: string;
      assignedDate?: string;
    },
    date?: string
  ) => {
    const targetDate = date || selectedDate || undefined;
    try {
      const res = await api.adminEditBoard(action, targetDate);
      setBoard(res.board);
      if (action.type === 'delete_column') {
        showToast(action.name ? `All tasks cleared for ${action.name}` : 'All tasks cleared for column', 'success');
      } else {
        showToast('Board updated successfully', 'success');
      }
    } catch (err: any) {
      console.error('Edit error', err);
      showToast(err.message || 'Failed to apply change', 'error');
      await fetchBoard(true, targetDate);
    }
  };

  // Add Comment (All team members)
  const handleAddComment = async (taskId: string, content: string) => {
    try {
      const res = await api.addComment(taskId, content, selectedDate);
      setBoard(res.board);
      showToast('Comment added', 'success');
    } catch (err: any) {
      console.error('Comment error', err);
      showToast(err.message || 'Failed to add comment', 'error');
    }
  };

  // Delete Comment (Admin or comment author)
  const handleDeleteComment = async (taskId: string, commentId: string) => {
    try {
      const res = await api.deleteComment(taskId, commentId, selectedDate);
      setBoard(res.board);
      showToast('Comment deleted', 'success');
    } catch (err: any) {
      console.error('Delete comment error', err);
      showToast(err.message || 'Failed to delete comment', 'error');
    }
  };

  // Toggle Task Completed or Update Quantity
  const handleToggleTaskComplete = async (
    taskId: string,
    completed?: boolean,
    completedQuantity?: number,
    totalQuantity?: number
  ) => {
    // Optimistic UI update
    if (board) {
      setBoard({
        ...board,
        columns: board.columns.map((col) => ({
          ...col,
          tasks: col.tasks.map((t) => {
            if (t.id === taskId) {
              const curTotal = totalQuantity !== undefined && totalQuantity > 0 ? totalQuantity : (t.totalQuantity || 1);
              const nextDone = completed !== undefined ? completed : !t.completed;
              const nextQty = completedQuantity !== undefined ? completedQuantity : (nextDone ? curTotal : 0);
              return {
                ...t,
                completed: nextDone,
                completedQuantity: nextQty,
                totalQuantity: curTotal,
                completedAt: nextDone ? new Date().toISOString() : null,
                adminApproved: nextDone ? t.adminApproved : false,
                adminApprovedBy: nextDone ? t.adminApprovedBy : null,
                adminApprovedAt: nextDone ? t.adminApprovedAt : null,
              };
            }
            return t;
          }),
        })),
      });
    }

    try {
      const res = await api.toggleTaskComplete(
        taskId,
        completed,
        selectedDate,
        completedQuantity,
        totalQuantity
      );
      setBoard(res.board);
      window.dispatchEvent(new CustomEvent('notification_refresh'));
    } catch (err: any) {
      console.error('Toggle complete error', err);
      showToast(err.message || 'Failed to update task status', 'error');
      await fetchBoard(true, selectedDate);
    }
  };

  // Admin Approves / Unapproves Task
  const handleApproveTask = async (taskId: string, approved: boolean) => {
    // Optimistic UI update for instant feedback
    if (board) {
      setBoard({
        ...board,
        columns: board.columns.map((col) => ({
          ...col,
          tasks: col.tasks.map((t) => {
            if (t.id === taskId) {
              return {
                ...t,
                adminApproved: approved,
                adminApprovedBy: approved ? (currentUser?.name || 'Admin') : null,
                completed: approved ? true : t.completed,
              };
            }
            return t;
          }),
        })),
      });
    }

    try {
      const res = await api.approveTask(taskId, approved, selectedDate);
      if (res?.board) {
        setBoard(res.board);
      }
      window.dispatchEvent(new CustomEvent('notification_refresh'));
      showToast(
        approved ? 'Task approved by Admin' : 'Admin approval removed',
        'success'
      );
    } catch (err: any) {
      console.warn('Approve task request:', err);
      // Refresh board from server to sync state
      try {
        const freshBoard = await api.getBoard(selectedDate);
        setBoard(freshBoard);
      } catch {
        // ignore background sync failure
      }
    }
  };

  // Handlers for Upload & Gemini Extraction
  const handleExtractionSuccess = (
    employees: Array<{
      name: string;
      originalExtractedName?: string;
      matchedName?: string;
      tasks: string[];
    }>,
    imagePreview: string | null,
    targetDate?: string,
    autoMatchedCount?: number
  ) => {
    setIsUploadOpen(false);
    setPendingExtraction({
      employees,
      imagePreview,
      targetDate,
      autoMatchedCount,
    });
  };

  const handleConfirmPublish = async (
    updatedEmployees: Array<{ name: string; tasks: string[] }>,
    dateToPublish?: string
  ) => {
    setIsPublishing(true);
    try {
      const targetDate = dateToPublish || pendingExtraction?.targetDate || selectedDate;
      const res = await api.publishBoard(updatedEmployees, targetDate);
      setBoard(res.board);
      if (res.board.selectedDate) {
        setSelectedDate(res.board.selectedDate);
      }
      setPendingExtraction(null);
      showToast(
        `Tasklist processed and published for ${res.board.selectedDate || 'the selected date'}!`,
        'success'
      );
    } catch (err: any) {
      console.error('Publish error', err);
      showToast(err.message || 'Failed to publish board', 'error');
    } finally {
      setIsPublishing(false);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Loading AMT Task Tracker...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginModal onLoginSuccess={handleLoginSuccess} />;
  }

  // If in review mode, show the required Review Screen
  if (pendingExtraction && Array.isArray(pendingExtraction.employees)) {
    return (
      <ReviewScreen
        initialEmployees={pendingExtraction.employees}
        imagePreview={pendingExtraction.imagePreview}
        initialDate={pendingExtraction.targetDate || selectedDate}
        autoMatchedCount={pendingExtraction.autoMatchedCount}
        onConfirmPublish={handleConfirmPublish}
        onCancel={() => setPendingExtraction(null)}
        isPublishing={isPublishing}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 w-full max-w-full">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 animate-fadeIn">
          <div
            className={`px-4 py-2.5 rounded-xl shadow-lg border text-xs font-semibold flex items-center gap-2 ${
              toastMessage.type === 'error'
                ? 'bg-rose-900 border-rose-700 text-rose-100'
                : toastMessage.type === 'info'
                ? 'bg-sky-900 border-sky-700 text-sky-100'
                : 'bg-emerald-900 border-emerald-700 text-emerald-100'
            }`}
          >
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* Main Navigation Bar */}
      <Navbar
        user={currentUser}
        token={getToken()}
        board={board}
        onOpenUpload={() => setIsUploadOpen(true)}
        onOpenUserManagement={
          currentUser?.role?.toLowerCase() === 'admin' && currentUser?.role !== 'manager'
            ? () => setIsUserManagementOpen(true)
            : undefined
        }
        onOpenManageVisibility={
          currentUser?.role?.toLowerCase() === 'admin' && currentUser?.role !== 'manager'
            ? () => setIsAssignModalOpen(true)
            : undefined
        }
        onLogout={handleLogout}
        onRefreshBoard={handleLiveRefreshBoard}
        isRefreshing={isRefreshing}
      />

      {/* WhatsApp-Style Background Notification Prompt Banner */}
      <NotificationBanner token={getToken()} user={currentUser} />

      {/* Main Board View Container */}
      <main className="flex-1 flex flex-col min-w-0 w-full max-w-full">
        {isBoardLoading && !board ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="flex flex-col items-center gap-2">
              <div className="w-7 h-7 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
              <p className="text-xs text-slate-500 font-medium">Loading active board...</p>
            </div>
          </div>
        ) : (
          <BoardView
            board={board}
            user={currentUser}
            selectedDate={selectedDate || board?.currentDate || new Date().toISOString().slice(0, 10)}
            onSelectDate={handleSelectDate}
            onOpenUpload={() => setIsUploadOpen(true)}
            onReorder={handleReorder}
            onAdminEdit={handleAdminEdit}
            onAddComment={handleAddComment}
            onDeleteComment={handleDeleteComment}
            onToggleTaskComplete={handleToggleTaskComplete}
            onApproveTask={handleApproveTask}
            isAssignModalOpen={isAssignModalOpen}
            setIsAssignModalOpen={setIsAssignModalOpen}
            isReportModalOpen={isReportModalOpen}
            setIsReportModalOpen={setIsReportModalOpen}
            onBoardUpdated={async (updatedBoard) => {
              if (updatedBoard) {
                setBoard(updatedBoard);
              }
              // Always re-fetch board to guarantee all columns are fresh and complete
              await fetchBoard(true);
              showToast('Manager assignments updated successfully!', 'success');
            }}
          />
        )}
      </main>

      {/* Admin: Upload & Gemini Vision Modal */}
      {currentUser.role === 'admin' && (
        <UploadModal
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          defaultDate={selectedDate || (board?.selectedDate ? board.selectedDate : undefined)}
          availableDates={board?.availableDates}
          onExtractionSuccess={handleExtractionSuccess}
          onSessionExpired={() => {
            api.logout();
            setCurrentUser(null);
            setPendingExtraction(null);
            showToast('Your session expired. Please sign in again.', 'error');
          }}
        />
      )}

      {/* Admin: Team & User Account Credentials Management Modal */}
      {currentUser.role === 'admin' && (
        <UserManagementModal
          isOpen={isUserManagementOpen}
          onClose={() => setIsUserManagementOpen(false)}
          currentUser={currentUser}
          onToast={showToast}
          onUserUpdated={async (updatedUser) => {
            if (updatedUser.id === currentUser.id) {
              setCurrentUser(updatedUser);
            }
            await fetchBoard(true);
          }}
          onTeamChanged={async () => {
            await fetchBoard(true);
          }}
        />
      )}
    </div>
  );
}
