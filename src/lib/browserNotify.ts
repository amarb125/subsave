/**
 * Browser notifications are a convenience, not a guarantee: they only fire while SubSave is
 * open in a browser tab. Nothing here runs in the background.
 */
export function browserNotificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function browserNotificationPermission(): NotificationPermission | 'unsupported' {
  return browserNotificationsSupported() ? Notification.permission : 'unsupported';
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!browserNotificationsSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function showBrowserNotification(title: string, body: string, tag?: string): void {
  if (!browserNotificationsSupported() || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, tag, icon: '/favicon.svg' });
  } catch {
    /* Some mobile browsers only allow notifications through a service worker. Ignore. */
  }
}
