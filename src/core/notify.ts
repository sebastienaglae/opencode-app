import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

let permissionChecked = false;

export async function notify(title: string, body: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    // Web fallback: only if the user already granted permission.
    try {
      if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body });
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    if (!permissionChecked) {
      permissionChecked = true;
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== "granted") await LocalNotifications.requestPermissions();
    }
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Math.random() * 1_000_000),
          title,
          body,
        },
      ],
    });
  } catch {
    /* ignore */
  }
}
