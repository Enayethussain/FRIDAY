package com.friday.ai.plugins;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import android.text.TextUtils;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@CapacitorPlugin(name = "NotificationReader")
public class NotificationReaderPlugin extends Plugin {

    private static final Map<String, JSObject> cachedNotifications = new ConcurrentHashMap<>();
    private static final List<JSObject> recentNotifications = new ArrayList<>();

    public static void onNotificationPosted(String packageName, String title, String text, long timestamp) {
        JSObject notif = new JSObject();
        notif.put("package", packageName);
        notif.put("title", title != null ? title : "");
        notif.put("text", text != null ? text : "");
        notif.put("timestamp", timestamp);
        notif.put("appName", getAppLabel(packageName));
        cachedNotifications.put(packageName, notif);
        synchronized (recentNotifications) {
            recentNotifications.add(0, notif);
            if (recentNotifications.size() > 50) {
                recentNotifications.remove(recentNotifications.size() - 1);
            }
        }
    }

    private static String getAppLabel(String packageName) {
        switch (packageName) {
            case "com.whatsapp": return "WhatsApp";
            case "com.whatsapp.w4b": return "WhatsApp Business";
            case "com.instagram.android": return "Instagram";
            case "com.google.android.gm": return "Gmail";
            case "com.google.android.apps.messaging": return "Messages";
            case "org.telegram.messenger": return "Telegram";
            case "com.facebook.katana": return "Facebook";
            case "com.twitter.android": return "Twitter";
            case "com.snapchat.android": return "Snapchat";
            default: return packageName;
        }
    }

    @PluginMethod
    public void isNotificationAccessEnabled(PluginCall call) {
        boolean enabled = isNotificationServiceRunning();
        JSObject result = new JSObject();
        result.put("enabled", enabled);
        if (!enabled) {
            result.put("settingsUrl", "notification_listener_access");
        }
        call.resolve(result);
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("opened", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Cannot open notification settings: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getRecentNotifications(PluginCall call) {
        Integer limit = call.getInt("limit", 20);
        String filter = call.getString("filter", "");
        List<JSObject> result = new ArrayList<>();
        synchronized (recentNotifications) {
            int count = 0;
            for (JSObject notif : recentNotifications) {
                if (count >= limit) break;
                if (filter.isEmpty() || notif.getString("package").toLowerCase().contains(filter.toLowerCase())) {
                    result.add(notif);
                    count++;
                }
            }
        }
        JSObject res = new JSObject();
        res.put("notifications", result);
        call.resolve(res);
    }

    @PluginMethod
    public void getLatestFromApp(PluginCall call) {
        String packageName = call.getString("packageName");
        if (packageName == null) {
            call.reject("Package name required");
            return;
        }
        JSObject notif = cachedNotifications.get(packageName);
        if (notif != null) {
            call.resolve(notif);
        } else {
            JSObject result = new JSObject();
            result.put("found", false);
            result.put("package", packageName);
            call.resolve(result);
        }
    }

    @PluginMethod
    public void getWhatsAppMessages(PluginCall call) {
        List<JSObject> msgs = new ArrayList<>();
        synchronized (recentNotifications) {
            for (JSObject notif : recentNotifications) {
                String pkg = notif.getString("package");
                if ("com.whatsapp".equals(pkg) || "com.whatsapp.w4b".equals(pkg)) {
                    msgs.add(notif);
                }
            }
        }
        JSObject result = new JSObject();
        result.put("messages", msgs);
        result.put("count", msgs.size());
        call.resolve(result);
    }

    @PluginMethod
    public void getInstagramMessages(PluginCall call) {
        List<JSObject> msgs = new ArrayList<>();
        synchronized (recentNotifications) {
            for (JSObject notif : recentNotifications) {
                if ("com.instagram.android".equals(notif.getString("package"))) {
                    msgs.add(notif);
                }
            }
        }
        JSObject result = new JSObject();
        result.put("messages", msgs);
        result.put("count", msgs.size());
        call.resolve(result);
    }

    @PluginMethod
    public void getUnreadCount(PluginCall call) {
        String packageName = call.getString("package", "");
        int count = 0;
        synchronized (recentNotifications) {
            for (JSObject notif : recentNotifications) {
                if (packageName.isEmpty() || packageName.equals(notif.getString("package"))) {
                    count++;
                }
            }
        }
        JSObject result = new JSObject();
        result.put("count", count);
        call.resolve(result);
    }

    private boolean isNotificationServiceRunning() {
        String notificationListener = "com.friday.ai.services.FridayNotificationListener";
        ActivityManager am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        List<ActivityManager.RunningServiceInfo> services = am.getRunningServices(Integer.MAX_VALUE);
        if (services != null) {
            for (ActivityManager.RunningServiceInfo service : services) {
                if (service.service.getClassName().equals(notificationListener)) {
                    return true;
                }
            }
        }
        return false;
    }
}
