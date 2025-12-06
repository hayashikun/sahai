import { eq } from "drizzle-orm";
import type { NotificationTrigger } from "../../../shared/index.js";
import { db } from "../db/client";
import { settings } from "../db/schema";
import { NOTIFICATION_DEFAULTS } from "./defaults";

export interface NotificationConfig {
  enabled: boolean;
  trigger: NotificationTrigger;
  sound: string | null;
}

export async function getNotificationConfig(): Promise<NotificationConfig> {
  const [enabledSetting, triggerSetting, soundSetting] = await Promise.all([
    db.select().from(settings).where(eq(settings.key, "notification.enabled")),
    db.select().from(settings).where(eq(settings.key, "notification.trigger")),
    db.select().from(settings).where(eq(settings.key, "notification.sound")),
  ]);

  return {
    enabled:
      enabledSetting.length > 0
        ? enabledSetting[0].value === "true"
        : NOTIFICATION_DEFAULTS.enabled,
    trigger:
      triggerSetting.length > 0
        ? (triggerSetting[0].value as NotificationTrigger)
        : NOTIFICATION_DEFAULTS.trigger,
    sound:
      soundSetting.length > 0 && soundSetting[0].value !== "null"
        ? soundSetting[0].value
        : NOTIFICATION_DEFAULTS.sound,
  };
}
