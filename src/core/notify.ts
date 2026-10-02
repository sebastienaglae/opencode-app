import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

let permissionChecked = false;

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display === "granted") {
      permissionChecked = true;
      return true;
    }
    const req = await LocalNotifications.requestPermissions();
    permissionChecked = req.display === "granted";
    return permissionChecked;
  } catch {
    return false;
  }
}

export async function notify(title: string, body: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    try {
      if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body });
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    if (!permissionChecked) {
      const granted = await ensureNotificationPermission();
      if (!granted) return;
    }
    await LocalNotifications.schedule({
      notifications: [{ id: Math.floor(Math.random() * 1_000_000), title, body, smallIcon: "ic_stat_opencode" }],
    });
  } catch {
    /* ignore */
  }
}
