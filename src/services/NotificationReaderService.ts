import { registerPlugin } from '@capacitor/core';

export interface NotificationData {
  package: string;
  title: string;
  text: string;
  timestamp: number;
  appName: string;
}

export interface NotificationReaderPluginInterface {
  isNotificationAccessEnabled(): Promise<{ enabled: boolean }>;
  openNotificationSettings(): Promise<{ opened: boolean }>;
  getRecentNotifications(options?: { limit?: number; filter?: string }): Promise<{ notifications: NotificationData[] }>;
  getLatestFromApp(options: { packageName: string }): Promise<NotificationData>;
  getWhatsAppMessages(): Promise<{ messages: NotificationData[]; count: number }>;
  getInstagramMessages(): Promise<{ messages: NotificationData[]; count: number }>;
  getUnreadCount(options?: { package?: string }): Promise<{ count: number }>;
}

const NotificationReader = registerPlugin<NotificationReaderPluginInterface>('NotificationReader');

export class NotificationReaderService {
  static async isEnabled(): Promise<boolean> {
    try {
      const result = await NotificationReader.isNotificationAccessEnabled();
      return result.enabled;
    } catch {
      return false;
    }
  }

  static async openSettings(): Promise<boolean> {
    try {
      await NotificationReader.openNotificationSettings();
      return true;
    } catch {
      return false;
    }
  }

  static async getRecent(limit = 20, filter?: string): Promise<NotificationData[]> {
    try {
      const result = await NotificationReader.getRecentNotifications({ limit, filter });
      return result.notifications;
    } catch {
      return [];
    }
  }

  static async getLatestFromApp(packageName: string): Promise<NotificationData | null> {
    try {
      return await NotificationReader.getLatestFromApp({ packageName });
    } catch {
      return null;
    }
  }

  static async getWhatsAppMessages(): Promise<NotificationData[]> {
    try {
      const result = await NotificationReader.getWhatsAppMessages();
      return result.messages;
    } catch {
      return [];
    }
  }

  static async getInstagramMessages(): Promise<NotificationData[]> {
    try {
      const result = await NotificationReader.getInstagramMessages();
      return result.messages;
    } catch {
      return [];
    }
  }

  static async getUnreadCount(packageName?: string): Promise<number> {
    try {
      const result = await NotificationReader.getUnreadCount({ package: packageName || '' });
      return result.count;
    } catch {
      return 0;
    }
  }

  static async getUnreadSummary(): Promise<Record<string, number>> {
    const apps = ['com.whatsapp', 'com.instagram.android', 'com.google.android.gm', 'org.telegram.messenger', 'com.android.mms'];
    const summary: Record<string, number> = {};
    for (const app of apps) {
      summary[app] = await this.getUnreadCount(app);
    }
    return summary;
  }
}
