import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  CheckCircle2,
  PlusCircle,
  Check,
  Trash2,
  X,
  Smartphone,
  Share2,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { AppNotification, User } from '../types';
import {
  registerServiceWorker,
  subscribeToBackgroundPush,
  triggerTestPush,
  isRunningInIframe,
  getDevicePushDiagnostics,
  isIOS,
  isStandalone,
} from '../lib/pushNotifications';

interface NotificationBellProps {
  user: User;
  token: string | null;
  onSelectDate?: (dateStr: string) => void;
  onBoardUpdate?: () => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  user,
  token,
  onBoardUpdate,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const isMemberRole = !['admin', 'manager'].includes((user.role || '').toLowerCase());
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [toastNotification, setToastNotification] = useState<AppNotification | null>(null);

  // Check if native browser push is granted on this specific device
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        return Notification.permission;
      } catch {
        return 'default';
      }
    }
    return 'default';
  });

  // Account-level push preference (synced across desktop and mobile)
  const [accountPushEnabled, setAccountPushEnabled] = useState<boolean>(() => {
    if (user?.pushEnabled) return true;
    try {
      const stored = localStorage.getItem(`artme_push_enabled_${user.id}`);
      return stored === 'true';
    } catch {
      return false;
    }
  });

  const [isSubmittingPush, setIsSubmittingPush] = useState<boolean>(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<any>(null);
  const knownNotificationIds = useRef<Set<string>>(new Set());
  const isInitialFetch = useRef<boolean>(true);
  const onBoardUpdateRef = useRef(onBoardUpdate);
  const lastHandledEventRef = useRef<{ key: string; time: number }>({ key: '', time: 0 });

  useEffect(() => {
    onBoardUpdateRef.current = onBoardUpdate;
  }, [onBoardUpdate]);

  // Push notification is ONLY active if this browser has granted permission
  const isPushActive = browserPermission === 'granted';

  // Sync push preference with server on mount and ensure background service worker is subscribed
  useEffect(() => {
    if (!token) return;
    registerServiceWorker();

    // If native push is already granted, automatically subscribe service worker for closed-tab push
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      subscribeToBackgroundPush(token, false).catch(() => {});
    }
  }, [token, user.id]);

  // Trigger system browser push notification (Desktop / Mobile OS notification)
  const triggerNativePush = async (notif: AppNotification) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.showNotification) {
          await reg.showNotification(notif.title, {
            body: notif.message,
            icon: '/favicon-192x192.png',
            badge: '/favicon-192x192.png',
            tag: notif.id,
            requireInteraction: true,
            vibrate: [200, 100, 200],
            data: { taskId: notif.taskId },
          } as any);
          return;
        }
      }

      const nativePush = new Notification(notif.title, {
        body: notif.message,
        icon: '/favicon-192x192.png',
        tag: notif.id,
      });

      nativePush.onclick = () => {
        window.focus();
        nativePush.close();
      };
    } catch (err) {
      console.warn('[Native Push] Notification trigger error:', err);
    }
  };

  // Turn on notifications directly when user clicks "Turn On Alerts"
  const handleEnablePush = async (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isSubmittingPush || !token) return;
    setIsSubmittingPush(true);

    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        const perm = await Notification.requestPermission();
        setBrowserPermission(perm);

        if (perm === 'granted') {
          playChime();
          await subscribeToBackgroundPush(token);

          // Fire an immediate native OS notification
          await triggerNativePush({
            id: 'welcome-' + Date.now(),
            userId: user.id,
            type: 'task_completed',
            title: 'Notifications Turned On 🎉',
            message: 'You will now receive instant desktop & mobile alerts for all task updates.',
            isRead: false,
            createdAt: new Date().toISOString(),
          });

          setToastNotification({
            id: 'toast-' + Date.now(),
            userId: user.id,
            type: 'task_completed',
            title: 'Alerts Active',
            message: 'Notifications turned on successfully!',
            isRead: false,
            createdAt: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      console.warn('[Enable Push Error]', err);
    } finally {
      setIsSubmittingPush(false);
    }
  };

  // Gentle audio chime using Web Audio API (no external asset needed)
  const playChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      // Pleasant high-two-tone ding: 587.33Hz (D5) -> 880Hz (A5)
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } catch {
      // Audio autoplay policy
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Process incoming notification (chime, toast, badge)
  const handleIncomingNotification = (latest: AppNotification) => {
    if (!latest || !latest.id) return;
    const cleanEmp = (latest.employeeName || '').toLowerCase().trim();
    if (cleanEmp === 'aa' || cleanEmp === 'shreay') {
      return;
    }
    if (knownNotificationIds.current.has(latest.id)) return;
    knownNotificationIds.current.add(latest.id);

    // Prevent duplicate alerts (sound, toast, push) within 5 seconds for the same task activity
    const eventKey = `${latest.taskId || latest.id}:${latest.title}:${latest.message}`;
    const nowMs = Date.now();
    const isDuplicateRecentEvent =
      lastHandledEventRef.current.key === eventKey && nowMs - lastHandledEventRef.current.time < 5000;

    const notifAgeMs = Math.abs(nowMs - new Date(latest.createdAt).getTime());
    if (!isDuplicateRecentEvent && (isNaN(notifAgeMs) || notifAgeMs < 300 * 1000)) {
      lastHandledEventRef.current = { key: eventKey, time: nowMs };
      playChime();
      setToastNotification(latest);

      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        setToastNotification(null);
      }, 7000);
    }

    // 3. Prepend to state
    setNotifications((prev) => [latest, ...prev.filter((n) => n.id !== latest.id)]);
    setUnreadCount((c) => c + 1);
  };

  // Fetch notifications from REST API
  const fetchNotifications = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/notifications', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const incoming: AppNotification[] = (data.notifications || []).filter((n: AppNotification) => {
          const emp = (n.employeeName || '').toLowerCase().trim();
          return emp !== 'aa' && emp !== 'shreay';
        });
        setNotifications(incoming);
        setUnreadCount(data.unreadCount || 0);

        if (isInitialFetch.current) {
          incoming.forEach((n) => knownNotificationIds.current.add(n.id));
          isInitialFetch.current = false;
        } else {
          const newNotifs = incoming.filter((n) => !knownNotificationIds.current.has(n.id));
          if (newNotifs.length > 0) {
            newNotifs.forEach((n) => knownNotificationIds.current.add(n.id));
            const latest = newNotifs[0];
            const eventKey = `${latest.taskId || latest.id}:${latest.title}:${latest.message}`;
            const nowMs = Date.now();
            const isDuplicateRecentEvent =
              lastHandledEventRef.current.key === eventKey && nowMs - lastHandledEventRef.current.time < 5000;

            const notifAgeMs = Math.abs(nowMs - new Date(latest.createdAt).getTime());
            // Strictly trigger sound and toast for fresh events that haven't been handled yet
            if (!isDuplicateRecentEvent && (isNaN(notifAgeMs) || notifAgeMs < 300 * 1000)) {
              lastHandledEventRef.current = { key: eventKey, time: nowMs };
              playChime();
              setToastNotification(latest);

              if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
              toastTimerRef.current = setTimeout(() => {
                setToastNotification(null);
              }, 7000);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[Notifications] Failed to fetch:', err);
    }
  };

  // Real-time Server-Sent Events (SSE) stream for zero-delay push delivery
  useEffect(() => {
    if (!token) return;

    // Initial fetch
    fetchNotifications();

    let eventSource: EventSource | null = null;
    try {
      const sseUrl = `/api/notifications/stream?token=${encodeURIComponent(token)}`;
      eventSource = new EventSource(sseUrl);

      eventSource.addEventListener('notification', (e) => {
        try {
          const notif: AppNotification = JSON.parse(e.data);
          if (notif && notif.id) {
            handleIncomingNotification(notif);
            // Dynamically refresh the board columns immediately when task notification arrives
            if (onBoardUpdateRef.current) {
              onBoardUpdateRef.current();
            }
          }
        } catch (err) {
          console.warn('[SSE Parse Error]', err);
        }
      });

      eventSource.addEventListener('board_update', () => {
        // Dynamically refresh notifications and board columns immediately
        fetchNotifications();
        if (onBoardUpdateRef.current) {
          onBoardUpdateRef.current();
        }
      });

      eventSource.onerror = () => {
        // EventSource automatically attempts reconnection
      };
    } catch (sseErr) {
      console.warn('[SSE Connection Failed, relying on polling]', sseErr);
    }

    // Fast 3-second fallback polling interval
    const interval = setInterval(fetchNotifications, 3000);

    // Immediate manual refresh listener when tasks are completed/approved locally
    const handleImmediateRefresh = () => {
      fetchNotifications();
    };
    window.addEventListener('notification_refresh', handleImmediateRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener('notification_refresh', handleImmediateRefresh);
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [token, user.id, isPushActive]);

  // Mark single read
  const handleMarkAsRead = async (notifId: string) => {
    if (!token) return;
    setNotifications((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, isRead: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));

    try {
      await fetch(`/api/notifications/${notifId}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error('[Notification] Failed to mark read:', err);
    }
  };

  // Mark all read
  const handleMarkAllRead = async () => {
    if (!token || unreadCount === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);

    try {
      await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error('[Notification] Failed to mark all read:', err);
    }
  };

  // Delete/dismiss notification
  const handleDeleteNotification = async (e: React.MouseEvent, notifId: string) => {
    e.stopPropagation();
    const target = notifications.find((n) => n.id === notifId);
    setNotifications((prev) => prev.filter((n) => n.id !== notifId));
    if (target && !target.isRead) {
      setUnreadCount((c) => Math.max(0, c - 1));
    }

    try {
      await fetch(`/api/notifications/${notifId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error('[Notification] Failed to delete:', err);
    }
  };

  // Clear all notifications
  const handleClearAll = async () => {
    if (!token || notifications.length === 0) return;
    setNotifications([]);
    setUnreadCount(0);

    try {
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error('[Notification] Failed to clear all:', err);
    }
  };

  const formatTimeAgo = (isoStr: string) => {
    try {
      const diffMs = Date.now() - new Date(isoStr).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch {
      return '';
    }
  };

  return (
    <div className="relative inline-flex items-center gap-1.5" ref={panelRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        id="btn-notifications-toggle"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) {
            fetchNotifications();
          }
        }}
        className={`relative p-2 rounded-full transition-colors cursor-pointer text-slate-300 hover:text-white hover:bg-white/10 ${
          isOpen ? 'bg-white/15 text-white' : ''
        }`}
        title="Notifications"
        aria-label="View notifications"
      >
        <Bell className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-md animate-pulse border-2 border-[#0B0B1E]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Floating In-App Toast Banner */}
      {toastNotification && (
        <div className="fixed top-16 right-4 sm:right-6 z-50 max-w-sm w-full bg-slate-900/95 backdrop-blur border border-slate-700 text-white rounded-2xl shadow-2xl p-3.5 flex items-start gap-3 animate-slideDown">
          <div className="shrink-0 mt-0.5">
            {toastNotification.type === 'task_completed' ? (
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
                <PlusCircle className="w-5 h-5" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-200">
                {toastNotification.title}
              </span>
              <span className="text-[10px] text-slate-400">Just now</span>
            </div>
            <p className="text-xs text-slate-300 mt-1 line-clamp-2 leading-relaxed">
              {toastNotification.message}
            </p>
          </div>
          <button
            onClick={() => setToastNotification(null)}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 max-w-[calc(100vw-2rem)] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[80vh] sm:max-h-[500px] animate-fadeIn">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-sm">Notifications</span>
              {unreadCount > 0 ? (
                <span className="px-2 py-0.5 text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-full">
                  {unreadCount} new
                </span>
              ) : (
                <span className="px-2 py-0.5 text-[10px] font-medium bg-slate-800 text-slate-400 rounded-full">
                  All caught up
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <Check className="w-3 h-3" />
                  <span>Mark read</span>
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-[11px] font-semibold text-slate-400 hover:text-rose-400 flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear all</span>
                </button>
              )}
            </div>
          </div>

          {/* Push Notification Status Banner */}
          {isPushActive ? (
            <div className="px-3.5 py-2.5 bg-emerald-950/40 border-b border-emerald-900/40 flex items-center justify-between text-xs text-emerald-300">
              <span className="flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Desktop & Phone Alerts Active</span>
              </span>
              <span className="text-[10px] text-emerald-400/90 font-bold px-2 py-0.5 rounded-full bg-emerald-900/60 border border-emerald-700/50 uppercase tracking-wider">
                ENABLED
              </span>
            </div>
          ) : browserPermission === 'denied' ? (
            <div className="px-3.5 py-2.5 bg-rose-950/60 border-b border-rose-900/50 text-xs text-rose-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <strong>Alerts Blocked:</strong> Click the lock/tune icon on your address bar to allow alerts.
                </div>
              </div>
            </div>
          ) : isIOS() && !isStandalone() ? (
            <div className="px-3.5 py-2.5 bg-indigo-950/60 border-b border-indigo-800/40 flex flex-col gap-1.5 text-xs">
              <div className="flex items-start gap-2 text-indigo-200">
                <Share2 className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <span className="text-[11px] leading-relaxed">
                  <strong>iPhone Setup:</strong> Apple requires saving to Home Screen. Tap <strong>Share</strong> (box with arrow ↑) in Safari, tap <strong>"Add to Home Screen"</strong>, then open the app icon from your screen!
                </span>
              </div>
            </div>
          ) : (
            <div className="px-3.5 py-2.5 bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 border-b border-indigo-800/60 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-slate-200 min-w-0">
                <Bell className="w-4 h-4 text-indigo-400 shrink-0 animate-bounce" />
                <div>
                  <div className="text-xs font-bold text-white">Notifications are OFF</div>
                  <div className="text-[10px] text-slate-300">Click to receive task alerts</div>
                </div>
              </div>
              <button
                type="button"
                id="btn-turn-on-alerts-bell"
                disabled={isSubmittingPush}
                onClick={handleEnablePush}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-bold rounded-lg shrink-0 cursor-pointer shadow-md transition-all flex items-center gap-1.5 hover:scale-105 active:scale-95"
              >
                {isSubmittingPush ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Enabling...</span>
                  </>
                ) : (
                  <>
                    <Bell className="w-3.5 h-3.5" />
                    <span>Turn On Alerts</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Notifications List */}
          <div className="overflow-y-auto divide-y divide-slate-800/80 flex-1">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-400 flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-slate-800/60 flex items-center justify-center text-slate-500 mb-2">
                  <Bell className="w-6 h-6" />
                </div>
                <p className="text-xs font-semibold text-slate-300">No notifications yet</p>
                <p className="text-[11px] text-slate-500 mt-1 max-w-[220px]">
                  {isMemberRole
                    ? "You will be notified whenever new tasks are assigned to you."
                    : "You will be notified when employees finish their tasks."}
                </p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => {
                    if (!notif.isRead) {
                      handleMarkAsRead(notif.id);
                    }
                  }}
                  className={`p-3.5 flex items-start gap-3 transition-colors cursor-pointer group hover:bg-slate-800/50 ${
                    !notif.isRead ? 'bg-indigo-950/20' : 'opacity-85'
                  }`}
                >
                  {/* Icon */}
                  <div className="shrink-0 mt-0.5">
                    {notif.type === 'task_completed' ? (
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
                        <PlusCircle className="w-4 h-4" />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="text-xs font-bold text-slate-200">
                        {notif.title}
                      </span>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap">
                        {formatTimeAgo(notif.createdAt)}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed break-words">
                      {notif.message}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="shrink-0 flex items-center gap-1">
                    {!notif.isRead && (
                      <span className="w-2 h-2 rounded-full bg-indigo-500" title="Unread" />
                    )}
                    <button
                      type="button"
                      onClick={(e) => handleDeleteNotification(e, notif.id)}
                      title="Dismiss"
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-white/5 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer note */}
          <div className="px-4 py-2 border-t border-slate-800 bg-slate-950/40 text-[10px] text-slate-500 text-center">
            {isMemberRole
              ? 'Real-time assignment updates for your column'
              : 'Real-time task completion alerts for team supervisors'}
          </div>
        </div>
      )}
    </div>
  );
};
