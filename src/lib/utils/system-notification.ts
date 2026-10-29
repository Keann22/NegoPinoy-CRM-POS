/**
 * Shows an OS-level notification when the browser allows it, and never throws.
 *
 * Android Chrome does not support `new Notification(...)` — it throws
 * "Illegal constructor" even when permission is granted. Uncaught inside a
 * React effect, that crashed the whole app on phones ("Application error").
 * On phones we fall back to a service worker registration if one exists;
 * otherwise we skip the OS notification (the in-app toast/modal still shows).
 */
export function showSystemNotification(title: string, options?: NotificationOptions): Notification | null {
  if (typeof window === 'undefined' || !('Notification' in window)) return null;
  if (Notification.permission !== 'granted') return null;

  try {
    return new Notification(title, options);
  } catch {
    try {
      navigator.serviceWorker?.getRegistration?.()
        .then((reg) => reg?.showNotification(title, options))
        .catch(() => {});
    } catch {
      /* no service worker support — skip the OS notification */
    }
    return null;
  }
}

/** Asks for notification permission without ever throwing (older browsers use a callback API). */
export function requestNotificationPermission() {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'default') return;
    const result = Notification.requestPermission();
    if (result && typeof (result as Promise<NotificationPermission>).catch === 'function') {
      (result as Promise<NotificationPermission>).catch(() => {});
    }
  } catch {
    /* ignore */
  }
}
