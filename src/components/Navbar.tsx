import React, { useState, useEffect } from 'react';
import { Camera, LogOut, ShieldCheck, RefreshCw, X, Users, UserCheck, Eye } from 'lucide-react';
import { User, BoardData } from '../types';
import { NotificationBell } from './NotificationBell';

interface NavbarProps {
  user: User;
  token: string | null;
  board: BoardData | null;
  onOpenUpload: () => void;
  onOpenUserManagement?: () => void;
  onOpenManageVisibility?: () => void;
  onLogout: () => void;
  onRefreshBoard: () => void;
  isRefreshing?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  token,
  board,
  onOpenUpload,
  onOpenUserManagement,
  onOpenManageVisibility,
  onLogout,
  onRefreshBoard,
  isRefreshing,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile/tablet dropdown automatically if viewport expands to desktop/laptop width
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const totalTasks = board?.columns?.reduce((acc, col) => acc + (col.tasks?.length || 0), 0) || 0;
  const colCount = board?.columns?.length || 0;

  const roleBadgeConfig = (user?.role && {
    admin: {
      label: 'Admin',
      desc: 'Upload & Full Edit',
      bg: 'bg-indigo-950/80 text-indigo-300 border-indigo-500/40',
    },
    manager: {
      label: 'Manager',
      desc: 'Reorder Priority Only',
      bg: 'bg-amber-950/80 text-amber-300 border-amber-500/40',
    },
    employee: {
      label: 'Team Member',
      desc: 'My Column & Tasks',
      bg: 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40',
    },
    Editors: {
      label: 'Editor',
      desc: 'My Column & Tasks',
      bg: 'bg-blue-950/80 text-blue-300 border-blue-500/40',
    },
    Designers: {
      label: 'Designer',
      desc: 'My Column & Tasks',
      bg: 'bg-purple-950/80 text-purple-300 border-purple-500/40',
    },
    Cinematographers: {
      label: 'Cinematographer',
      desc: 'My Column & Tasks',
      bg: 'bg-rose-950/80 text-rose-300 border-rose-500/40',
    },
  }[user.role as string]) || {
    label: user?.role ? String(user.role).toUpperCase() : 'Member',
    desc: 'Access',
    bg: 'bg-slate-900 text-slate-300 border-slate-700',
  };

  return (
    <header className="bg-[#0B0B1E] border-b border-[#1A1C38] sticky top-0 z-30 shadow-md w-full">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-13 sm:h-16">
          {/* Left: Hamburger (Mobile & Tablet only) & Brand Wordmark */}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0 min-w-0">
            {/* Hamburger / Menu Toggle: visible only on mobile and tablet (< 1024px) */}
            <button
              type="button"
              id="btn-toggle-mobile-menu"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex lg:hidden flex-col justify-center items-center gap-1 w-7 h-7 sm:w-8 sm:h-8 rounded-lg hover:bg-white/10 transition-colors cursor-pointer text-white shrink-0"
              title="Toggle Menu"
              aria-label="Toggle Menu"
            >
              {mobileMenuOpen ? (
                <X className="w-4 h-4 text-white" />
              ) : (
                <>
                  <span className="w-4 sm:w-5 h-0.5 bg-white rounded-full"></span>
                  <span className="w-4 sm:w-5 h-0.5 bg-white rounded-full"></span>
                </>
              )}
            </button>

            {/* AMT Task Tracker Wordmark */}
            <div className="flex items-center select-none">
              <div className="font-display font-black text-sm sm:text-xl tracking-tight text-white flex items-center">
                <span>AMT</span>
                <span className="text-[#E879F9] ml-1.5 font-bold tracking-normal text-xs sm:text-base">TASK TRACKER</span>
              </div>
            </div>

            {/* Live Board Status Pill (Desktop & Laptop only) */}
            <div className="hidden lg:flex items-center gap-2 pl-4 border-l border-white/10">
              {colCount > 0 ? (
                <div className="flex items-center gap-2 text-xs text-slate-300 bg-white/5 border border-white/10 px-3 py-1 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-medium text-white">{colCount} Columns</span>
                  <span className="text-white/30">•</span>
                  <span className="text-slate-300">{totalTasks} Tasks</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-950/40 border border-amber-500/30 px-3 py-1 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>No Active Board</span>
                </div>
              )}

              <button
                id="btn-refresh-board"
                onClick={onRefreshBoard}
                title="Refresh Board"
                disabled={isRefreshing}
                className="p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-white/10 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
              </button>
            </div>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Admin: Manage Visibility of columns for Managers */}
            {user?.role?.toLowerCase() === 'admin' && user?.role !== 'manager' && onOpenManageVisibility && (
              <button
                id="btn-navbar-manage-visibility"
                onClick={onOpenManageVisibility}
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-200 hover:text-white border border-indigo-500/40 rounded-full text-xs font-semibold transition-all cursor-pointer shadow-xs"
                title="Manage visibility of employee columns for managers"
              >
                <Eye className="w-3.5 h-3.5 text-indigo-400" />
                <span>Manage Visibility</span>
              </button>
            )}

            {/* Admin: Team & Users Management Button (Strictly Admin only, never Manager) */}
            {user?.role?.toLowerCase() === 'admin' && user?.role !== 'manager' && onOpenUserManagement && (
              <button
                id="btn-manage-users"
                onClick={onOpenUserManagement}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white border border-white/10 rounded-full text-xs font-semibold transition-all cursor-pointer"
                title="Manage Team Member & Manager Accounts"
              >
                <Users className="w-3.5 h-3.5 text-indigo-400" />
                <span>Team Accounts</span>
              </button>
            )}

            {/* Primary "Upload" Button (Admin Only) */}
            {user.role === 'admin' ? (
              <button
                id="btn-upload-board-photo"
                onClick={onOpenUpload}
                className="rounded-full bg-[#2E2BE6] hover:bg-[#221fd4] text-white px-2.5 sm:px-4 py-1 sm:py-2 font-bold text-[11px] sm:text-xs tracking-wide shadow-md transition-all flex items-center gap-1 sm:gap-1.5 hover:scale-[1.02] active:scale-[0.98] shrink-0"
              >
                <Camera className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span>Upload</span>
              </button>
            ) : (
              <div
                title={user.role === 'manager' ? 'Managers reorder tasks only (Admin uploads photos)' : 'Team Members view & comment on their personal column'}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-white/5 text-slate-400 border border-white/10 rounded-full text-xs font-semibold"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                <span>{user.role === 'manager' ? 'Manager' : 'Team Member'}</span>
              </div>
            )}

            {/* Notification Bell */}
            <NotificationBell user={user} token={token} onBoardUpdate={onRefreshBoard} />

            {/* User Profile Pill & Logout */}
            <div className="flex items-center gap-1 sm:gap-2 pl-1.5 sm:pl-2 border-l border-white/10 shrink-0">
              <div
                className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/5 border border-white/10 text-xs"
                title={`${user.name} (${roleBadgeConfig.label})`}
              >
                <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-[#2E2BE6] to-[#E879F9] flex items-center justify-center text-white text-[10px] font-black uppercase shrink-0">
                  {user.name.slice(0, 2)}
                </div>
                <span className="text-xs font-medium text-slate-200 hidden lg:inline max-w-[100px] truncate">
                  {user.name}
                </span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold uppercase tracking-wider ${roleBadgeConfig.bg}`}>
                  {roleBadgeConfig.label}
                </span>
              </div>

              <button
                id="btn-logout"
                onClick={onLogout}
                title="Log out"
                className="hidden sm:flex p-1.5 sm:p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile & Tablet Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden py-3 border-t border-white/10 space-y-3 animate-fadeIn">
            {/* User Info Bar */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-200">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#2E2BE6] to-[#E879F9] flex items-center justify-center text-white text-xs font-black uppercase">
                  {user.name.slice(0, 2)}
                </div>
                <div>
                  <div className="font-bold text-white text-xs leading-none">{user.name}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{user.email}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[9px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider ${roleBadgeConfig.bg}`}>
                  {roleBadgeConfig.label}
                </span>
                <button
                  id="btn-mobile-logout"
                  onClick={onLogout}
                  title="Log out"
                  className="p-1.5 text-rose-400 hover:text-rose-300 rounded-lg hover:bg-rose-500/10 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Admin: Manage Visibility on mobile */}
            {user?.role?.toLowerCase() === 'admin' && user?.role !== 'manager' && onOpenManageVisibility && (
              <button
                onClick={() => {
                  onOpenManageVisibility();
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl bg-indigo-950/60 hover:bg-indigo-900/80 border border-indigo-500/40 text-xs font-semibold text-indigo-200 hover:text-white transition-colors cursor-pointer"
              >
                <Eye className="w-4 h-4 text-indigo-400" />
                <span>Manage Column Visibility</span>
              </button>
            )}

            {/* Admin: Team Management on mobile (Strictly Admin only, never Manager) */}
            {user?.role?.toLowerCase() === 'admin' && user?.role !== 'manager' && onOpenUserManagement && (
              <button
                onClick={() => {
                  onOpenUserManagement();
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white transition-colors"
              >
                <Users className="w-4 h-4 text-indigo-400" />
                <span>Manage Team Accounts</span>
              </button>
            )}

            {/* Board Status & Refresh on mobile & tablet */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>
                  {colCount} Columns • {totalTasks} Tasks
                </span>
              </div>
              <button
                onClick={() => {
                  onRefreshBoard();
                  setMobileMenuOpen(false);
                }}
                disabled={isRefreshing}
                className="flex items-center gap-1 text-[11px] font-bold text-indigo-400 hover:text-indigo-300"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
