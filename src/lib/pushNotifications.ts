/**
 * Web Push & Service Worker Notification Client
 * Subscribes to browser Web Push so notifications fire even when the tab is closed.
 */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isRunningInIframe(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
}

export function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as any).standalone)
  );
}

export function isInAppBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || navigator.vendor || '';
  return /FBAN|FBAV|Instagram|WhatsApp|Line|Snapchat|Twitter|MicroMessenger/i.test(ua);
}

export function getDevicePushDiagnostics(): {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  isIOS: boolean;
  isStandalone: boolean;
  isInAppBrowser: boolean;
  isIframe: boolean;
  reason?: string;
} {
  if (typeof window === 'undefined') {
    return {
      supported: false,
      permission: 'unsupported',
      isIOS: false,
      isStandalone: false,
      isInAppBrowser: false,
      isIframe: false,
      reason: 'No window environment',
    };
  }

  const iframe = isRunningInIframe();
  const ios = isIOS();
  const standalone = isStandalone();
  const inApp = isInAppBrowser();
  const hasSW = 'serviceWorker' in navigator;
  const hasNotification = 'Notification' in window;

  let perm: NotificationPermission | 'unsupported' = 'unsupported';
  if (hasNotification) {
    try {
      perm = Notification.permission;
    } catch {
      perm = 'unsupported';
    }
  }

  if (iframe) {
    return {
      supported: false,
      permission: perm,
      isIOS: ios,
      isStandalone: standalone,
      isInAppBrowser: inApp,
      isIframe: true,
      reason: 'Browser security restricts push notifications inside embedded preview frames.',
    };
  }

  if (inApp) {
    return {
      supported: false,
      permission: perm,
      isIOS: ios,
      isStandalone: standalone,
      isInAppBrowser: true,
      isIframe: false,
      reason: 'In-app browsers (like WhatsApp/Instagram) disable web push. Please open in Chrome or Safari.',
    };
  }

  if (ios && !standalone) {
    return {
      supported: false,
      permission: perm,
      isIOS: true,
      isStandalone: false,
      isInAppBrowser: false,
      isIframe: false,
      reason: 'Apple iOS requires adding the app to your Home Screen before enabling notifications.',
    };
  }

  if (!hasSW) {
    return {
      supported: false,
      permission: perm,
      isIOS: ios,
      isStandalone: standalone,
      isInAppBrowser: inApp,
      isIframe: false,
      reason: 'Service Workers are not supported on this browser.',
    };
  }

  return {
    supported: true,
    permission: perm,
    isIOS: ios,
    isStandalone: standalone,
    isInAppBrowser: inApp,
    isIframe: false,
  };
}

async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }

  // Modern Promise-based API
  try {
    const res = Notification.requestPermission();
    if (res && typeof res.then === 'function') {
      return await res;
    }
  } catch {}

  // Fallback for older mobile web engines
  return new Promise((resolve) => {
    try {
      Notification.requestPermission((perm) => {
        resolve(perm);
      });
    } catch {
      resolve('denied');
    }
  });
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    return registration;
  } catch (err) {
    console.warn('[Push] Service worker registration failed:', err);
    return null;
  }
}

let inFlightSubscribePromise: Promise<{
  success: boolean;
  error?: string;
  errorCode?: string;
  registration?: ServiceWorkerRegistration;
}> | null = null;

export async function subscribeToBackgroundPush(
  authToken: string,
  showWelcomeNotification: boolean = false
): Promise<{ success: boolean; error?: string; errorCode?: string; registration?: ServiceWorkerRegistration }> {
  if (inFlightSubscribePromise) {
    return inFlightSubscribePromise;
  }

  inFlightSubscribePromise = (async () => {
    if (typeof window === 'undefined') {
      return { success: false, error: 'Window object not available.' };
    }

    // 1. Diagnostics check for environment issues
    const diag = getDevicePushDiagnostics();

    if (diag.isIframe) {
      return {
        success: false,
        errorCode: 'IFRAME',
        error: 'Push notifications cannot run inside an embedded frame. Please open in a full browser tab.',
      };
    }

    if (diag.isInAppBrowser) {
      return {
        success: false,
        errorCode: 'IN_APP_BROWSER',
        error: 'Please open this page in Chrome or Safari (outside the in-app browser) to enable alerts.',
      };
    }

    if (diag.isIOS && !diag.isStandalone) {
      return {
        success: false,
        errorCode: 'IOS_ADD_TO_HOME',
        error:
          'On iPhone/iPad, Apple requires adding this app to your Home Screen: Tap the Share button (square with arrow ↑) -> "Add to Home Screen", then open from your Home Screen to turn on alerts.',
      };
    }

    if (!('serviceWorker' in navigator) || !('Notification' in window)) {
      return {
        success: false,
        errorCode: 'UNSUPPORTED',
        error: 'Your current browser does not support Web Push notifications. Please try Google Chrome or Safari.',
      };
    }

    try {
      // 2. Check and request permission
      let perm: NotificationPermission = Notification.permission;

      if (perm === 'denied') {
        return {
          success: false,
          errorCode: 'PERMISSION_BLOCKED',
          error:
            'Notifications are blocked in your site settings. Click the lock/tune icon near your URL bar, change Notifications to "Allow", and try again.',
        };
      }

      if (perm !== 'granted') {
        perm = await requestNotificationPermission();
      }

      if (perm !== 'granted') {
        return {
          success: false,
          errorCode: 'PERMISSION_DENIED',
          error: 'Notification permission was not granted. Please allow notifications when prompted.',
        };
      }

      // 3. Register or get Service Worker
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      }

      // Wait up to 3 seconds for service worker activation
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((res) => setTimeout(res, 3000)),
      ]);

      const activeReg = await navigator.serviceWorker.ready;
      if (!activeReg || !activeReg.pushManager) {
        return {
          success: false,
          errorCode: 'NO_PUSH_MANAGER',
          error: 'Push Manager is not accessible in this browser mode.',
        };
      }

      // 4. Fetch backend VAPID public key
      const res = await fetch('/api/notifications/vapid-public-key', {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!res.ok) {
        return {
          success: false,
          errorCode: 'VAPID_FETCH_FAILED',
          error: 'Could not connect to notification server keys.',
        };
      }

      const { publicKey } = await res.json();
      if (!publicKey) {
        return {
          success: false,
          errorCode: 'EMPTY_VAPID_KEY',
          error: 'Notification server returned an invalid key.',
        };
      }

      // 5. Check if valid subscription already exists for this service worker
      let subscription = await activeReg.pushManager.getSubscription();

      // Only generate new subscription if none exists
      if (!subscription) {
        const applicationServerKey = urlBase64ToUint8Array(publicKey) as unknown as BufferSource;
        subscription = await activeReg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }

      if (!subscription) {
        return {
          success: false,
          errorCode: 'SUBSCRIPTION_FAILED',
          error: 'Browser push service failed to generate a subscription endpoint.',
        };
      }

      // 6. Save subscription to backend database for the logged-in user with origin info
      const clientOrigin = typeof window !== 'undefined' ? window.location.origin : '';
      const subRes = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          origin: clientOrigin,
        }),
      });

      if (!subRes.ok) {
        return {
          success: false,
          errorCode: 'BACKEND_SAVE_FAILED',
          error: 'Failed to record device subscription with the whiteboard server.',
        };
      }

      // 7. Pop up a local verification alert immediately ONLY if explicitly requested
      if (showWelcomeNotification) {
        try {
          await activeReg.showNotification('Task Engine Notifications Active! 🔔', {
            body: 'System notifications are connected! You will receive alerts even when this tab is closed.',
            icon: '/favicon-192x192.png',
            badge: '/favicon-192x192.png',
            tag: 'push-activated-' + Date.now(),
            requireInteraction: true,
          });
        } catch (popupErr) {
          console.warn('[Push] Local verification notification failed:', popupErr);
        }
      }

      return { success: true, registration: activeReg };
    } catch (err: any) {
      console.error('[Push] Subscription failed with error:', err);
      return {
        success: false,
        errorCode: 'EXCEPTION',
        error: err?.message || 'Unexpected error activating push notifications.',
      };
    }
  })().finally(() => {
    inFlightSubscribePromise = null;
  });

  return inFlightSubscribePromise;
}

export async function triggerTestPush(
  authToken: string,
  delaySeconds: number = 3
): Promise<{ success: boolean; message: string }> {
  // 1. Ensure user has a valid active push subscription first
  const subResult = await subscribeToBackgroundPush(authToken);
  if (!subResult.success) {
    return {
      success: false,
      message: subResult.error || 'Failed to initialize background push subscription.',
    };
  }

  // 2. Schedule backend push from server
  try {
    const res = await fetch('/api/notifications/test-push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ delaySeconds }),
    });

    if (!res.ok) {
      return { success: false, message: 'Server failed to schedule background push.' };
    }

    return {
      success: true,
      message: `System alert triggered! A background push is scheduled in ${delaySeconds}s. Minimize or close this tab now to see it pop up!`,
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Network error triggering test push.' };
  }
}
