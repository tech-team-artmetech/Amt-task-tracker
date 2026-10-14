import React, { useState, useEffect } from 'react';
import {
  Bell,
  X,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Share2,
} from 'lucide-react';
import { User } from '../types';
import {
  subscribeToBackgroundPush,
  getDevicePushDiagnostics,
  isIOS,
  isStandalone,
} from '../lib/pushNotifications';

interface NotificationBannerProps {
  token: string | null;
  user: User | null;
}

export const NotificationBanner: React.FC<NotificationBannerProps> = ({ token, user }) => {
  const [diag, setDiag] = useState(() => getDevicePushDiagnostics());
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const [isEnabling, setIsEnabling] = useState<boolean>(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [justEnabled, setJustEnabled] = useState<boolean>(false);

  // Re-check diagnostics on mount and window focus
  useEffect(() => {
    const update = () => setDiag(getDevicePushDiagnostics());
    update();
    window.addEventListener('focus', update);
    return () => window.removeEventListener('focus', update);
  }, []);

  // If permission is already granted, ensure service worker subscription is synced with server
  useEffect(() => {
    if (!token || !user) return;
    if (diag.permission === 'granted') {
      subscribeToBackgroundPush(token, false).catch((err) => {
        console.warn('[Push Banner] Auto-subscribe error:', err);
      });
    }
  }, [token, user, diag.permission]);

  if (!user || !token || isDismissed) {
    return null;
  }

  // 1. Success confirmation
  if (justEnabled || diag.permission === 'granted') {
    if (!justEnabled) return null; // Keep navbar clean once granted and acknowledged
    return (
      <div className="bg-emerald-950/90 border-b border-emerald-800 text-emerald-200 px-4 py-2.5 flex items-center justify-between text-xs animate-fadeIn shadow-sm">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-semibold">
            Notifications are active! You will now receive instant alerts whenever tasks are completed or assigned.
          </span>
        </div>
        <button
          onClick={() => setJustEnabled(false)}
          className="p-1 text-emerald-400 hover:text-white rounded-md cursor-pointer"
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // 2. iPhone / iOS Safari (requires Add to Home Screen for Apple Web Push)
  if (isIOS() && !isStandalone()) {
    return (
      <div className="bg-gradient-to-r from-indigo-950 via-[#0B0B1E] to-indigo-950 border-b border-indigo-700/60 text-white px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3 shadow-md animate-fadeIn">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-300 shrink-0">
            <Share2 className="w-4 h-4" />
          </div>
          <div className="text-xs leading-relaxed">
            <span className="font-bold text-indigo-200 block sm:inline">
              📱 iPhone Alerts:
            </span>
            <span className="text-slate-200 ml-0 sm:ml-1.5">
              Tap <strong>Share</strong> (box with arrow ↑) in Safari, tap <strong>"Add to Home Screen"</strong>, then launch the app to receive notifications.
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsDismissed(true)}
          className="p-1 text-slate-400 hover:text-white rounded-md cursor-pointer shrink-0"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // 3. Permission blocked / denied in browser site settings
  if (diag.permission === 'denied') {
    return (
      <div className="bg-gradient-to-r from-rose-950 via-slate-900 to-rose-950 border-b border-rose-800/60 text-white px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2 shadow-sm animate-fadeIn">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-300 shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="text-xs">
            <span className="font-bold text-rose-200">
              Notifications are blocked in your browser
            </span>
            <span className="text-slate-300 ml-2 hidden sm:inline">
              Click the lock/tune icon on the left of your URL bar, set <strong>Notifications</strong> to <strong>Allow</strong>, then refresh.
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-3 py-1 bg-rose-700 hover:bg-rose-600 text-white rounded-lg text-xs font-bold shrink-0 cursor-pointer flex items-center gap-1.5"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Refresh</span>
        </button>
      </div>
    );
  }

  // 4. Default state: Prompt user with a prominent "Turn On Notifications" button
  const handleTurnOn = async () => {
    if (isEnabling || !token) return;
    setIsEnabling(true);
    setBannerError(null);

    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        const perm = await Notification.requestPermission();
        setDiag(getDevicePushDiagnostics());

        if (perm === 'granted') {
          // Subscribe service worker for web push
          await subscribeToBackgroundPush(token);

          // Fire an immediate native OS notification so user sees it work
          if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.ready;
            if (reg && reg.showNotification) {
              await reg.showNotification('Notifications Turned On 🎉', {
                body: 'You will now receive instant desktop & mobile alerts whenever tasks are completed or updated.',
                icon: '/favicon-192x192.png',
                badge: '/favicon-192x192.png',
              });
            }
          }
          setJustEnabled(true);
        } else if (perm === 'denied') {
          setBannerError('Notifications were blocked. You can enable them anytime from your browser site settings.');
        }
      } else {
        setBannerError('Notifications are not supported by this browser.');
      }
    } catch (err: any) {
      console.error('[Enable Notifications Error]', err);
      setBannerError(err?.message || 'Could not request notification permission.');
    } finally {
      setIsEnabling(false);
    }
  };

  return (
    <div className="bg-gradient-to-r from-[#0E0E2C] via-[#1A1A4A] to-[#0E0E2C] border-b border-indigo-700/60 text-white px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3 shadow-md animate-fadeIn">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shrink-0 shadow-sm">
          <Bell className="w-4 h-4 animate-bounce" />
        </div>
        <div className="text-xs">
          <span className="font-bold text-white block sm:inline">
            Turn on notifications for task updates
          </span>
          <span className="text-indigo-200/90 ml-0 sm:ml-2 block sm:inline">
            Get instant alerts when tasks are assigned, completed, or updated.
          </span>
          {bannerError && (
            <div className="text-rose-300 font-semibold mt-0.5 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>{bannerError}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          id="btn-turn-on-notifications-banner"
          disabled={isEnabling}
          onClick={handleTurnOn}
          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer touch-manipulation hover:scale-105 active:scale-95"
        >
          {isEnabling ? (
            <>
              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Requesting...</span>
            </>
          ) : (
            <>
              <Bell className="w-3.5 h-3.5" />
              <span>Turn On Notifications</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => setIsDismissed(true)}
          className="p-1 text-slate-400 hover:text-white rounded-md cursor-pointer"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
