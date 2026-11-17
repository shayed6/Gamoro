import { isWebPushOptedIn, setWebPushOptIn } from './storage';

export type WebPushSupportState = 'unsupported' | 'denied' | 'granted' | 'default';

export function getWebPushSupport(): WebPushSupportState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as WebPushSupportState;
}

export async function requestWebPushPermission(): Promise<{
  ok: boolean;
  permission: WebPushSupportState;
  message: string;
}> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return {
      ok: false,
      permission: 'unsupported',
      message: 'এই ব্রাউজারে পুশ নোটিফিকেশন সমর্থিত নয়।',
    };
  }

  try {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      setWebPushOptIn(true);
      // Future-ready hook: register PushManager subscription if VAPID key & service worker exist
      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
          if (reg && 'pushManager' in reg && vapidKey) {
            await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: vapidKey,
            });
          }
        } catch {
          // Safe graceful fallback until VAPID/SW is deployed
        }
      }
      return {
        ok: true,
        permission: 'granted',
        message: 'ব্রাউজার পুশ নোটিফিকেশন চালু করা হয়েছে!',
      };
    }

    setWebPushOptIn(false);
    return {
      ok: false,
      permission: perm as WebPushSupportState,
      message:
        perm === 'denied'
          ? 'ব্রাউজার সেটিংস থেকে নোটিফিকেশন অনুমতি বন্ধ করা আছে।'
          : 'নোটিফিকেশন অনুমতি দেওয়া হয়নি।',
    };
  } catch {
    return {
      ok: false,
      permission: getWebPushSupport(),
      message: 'নোটিফিকেশন চালু করা যায়নি।',
    };
  }
}

export function sendLocalReminderPreview(title: string, body: string): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'granted' && isWebPushOptedIn()) {
    try {
      new Notification(title, {
        body,
        icon: '/logo.png',
      });
    } catch {
      // ignore on platforms requiring SW showNotification
    }
  }
}
