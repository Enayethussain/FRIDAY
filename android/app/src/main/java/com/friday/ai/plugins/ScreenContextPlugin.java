package com.friday.ai.plugins;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Process;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Calendar;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

@CapacitorPlugin(name = "ScreenContext")
public class ScreenContextPlugin extends Plugin {

    private static String lastPackageName = "";
    private static String lastActivity = "";
    private static long lastTimestamp = 0;

    @PluginMethod
    public void checkUsagePermission(PluginCall call) {
        boolean granted = false;
        try {
            AppOpsManager appOps = (AppOpsManager) getContext().getSystemService(Context.APP_OPS_SERVICE);
            int mode = appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), getContext().getPackageName());
            granted = (mode == AppOpsManager.MODE_ALLOWED);
        } catch (Exception e) {
            granted = false;
        }
        JSObject result = new JSObject();
        result.put("granted", granted);
        call.resolve(result);
    }

    @PluginMethod
    public void openUsageSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("opened", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Cannot open usage settings: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getCurrentApp(PluginCall call) {
        try {
            UsageStatsManager usm = (UsageStatsManager) getContext().getSystemService(Context.USAGE_STATS_SERVICE);
            if (usm == null) {
                call.reject("UsageStatsManager not available");
                return;
            }

            long now = System.currentTimeMillis();
            UsageEvents events = usm.queryEvents(now - 60000, now);

            String packageName = "";
            String activityName = "";
            UsageEvents.Event lastEvent = new UsageEvents.Event();

            while (events.hasNextEvent()) {
                UsageEvents.Event event = new UsageEvents.Event();
                events.getNextEvent(event);
                if (event.getEventType() == UsageEvents.Event.MOVE_TO_FOREGROUND ||
                    event.getEventType() == UsageEvents.Event.ACTIVITY_RESUMED) {
                    packageName = event.getPackageName();
                    activityName = event.getClassName();
                    lastEvent = event;
                }
            }

            if (packageName.isEmpty()) {
                // Fallback: get top activity via reflection
                packageName = getTopPackage();
            }

            String appName = getAppName(packageName);
            String category = categorizeApp(packageName);
            String activity = simplifyActivity(activityName);

            lastPackageName = packageName;
            lastActivity = activity;
            lastTimestamp = System.currentTimeMillis();

            JSObject result = new JSObject();
            result.put("package", packageName);
            result.put("appName", appName);
            result.put("activity", activity);
            result.put("category", category);
            result.put("timestamp", lastTimestamp);
            call.resolve(result);
        } catch (SecurityException e) {
            call.reject("Usage permission required");
        } catch (Exception e) {
            call.reject("Cannot get current app: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getRecentApps(PluginCall call) {
        int limit = call.getInt("limit", 10);
        try {
            UsageStatsManager usm = (UsageStatsManager) getContext().getSystemService(Context.USAGE_STATS_SERVICE);
            if (usm == null) {
                call.reject("UsageStatsManager not available");
                return;
            }

            long now = System.currentTimeMillis();
            long start = now - (30 * 60 * 1000); // last 30 minutes
            UsageEvents events = usm.queryEvents(start, now);

            TreeMap<Long, JSObject> appMap = new TreeMap<>();
            while (events.hasNextEvent()) {
                UsageEvents.Event event = new UsageEvents.Event();
                events.getNextEvent(event);
                if (event.getEventType() == UsageEvents.Event.MOVE_TO_FOREGROUND ||
                    event.getEventType() == UsageEvents.Event.ACTIVITY_RESUMED) {
                    JSObject app = new JSObject();
                    app.put("package", event.getPackageName());
                    app.put("appName", getAppName(event.getPackageName()));
                    app.put("category", categorizeApp(event.getPackageName()));
                    app.put("timestamp", event.getTimeStamp());
                    appMap.put(event.getTimeStamp(), app);
                }
            }

            com.getcapacitor.JSArray apps = new com.getcapacitor.JSArray();
            int count = 0;
            // Iterate in reverse (newest first)
            java.util.List<Long> keys = new java.util.ArrayList<>(appMap.keySet());
            java.util.Collections.reverse(keys);
            for (Long key : keys) {
                if (count >= limit) break;
                apps.put(appMap.get(key));
                count++;
            }

            JSObject result = new JSObject();
            result.put("apps", apps);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Cannot get recent apps: " + e.getMessage());
        }
    }

    @PluginMethod
    public void isExcludedApp(PluginCall call) {
        String packageName = call.getString("package", "");
        boolean excluded = isPrivateApp(packageName);
        JSObject result = new JSObject();
        result.put("excluded", excluded);
        call.resolve(result);
    }

    private String getTopPackage() {
        try {
            android.app.ActivityManager am = (android.app.ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
            if (am != null) {
                List<android.app.ActivityManager.RunningTaskInfo> tasks = am.getRunningTasks(1);
                if (tasks != null && !tasks.isEmpty()) {
                    return tasks.get(0).topActivity.getPackageName();
                }
            }
        } catch (Exception e) {}
        return "";
    }

    private String getAppName(String packageName) {
        try {
            PackageManager pm = getContext().getPackageManager();
            ApplicationInfo info = pm.getApplicationInfo(packageName, 0);
            return info.loadLabel(pm).toString();
        } catch (Exception e) {
            return packageName;
        }
    }

    private String categorizeApp(String packageName) {
        if (packageName.contains("whatsapp")) return "messaging";
        if (packageName.contains("instagram")) return "social";
        if (packageName.contains("facebook")) return "social";
        if (packageName.contains("twitter") || packageName.contains("x.com")) return "social";
        if (packageName.contains("telegram")) return "messaging";
        if (packageName.contains("youtube")) return "video";
        if (packageName.contains("netflix")) return "video";
        if (packageName.contains("spotify")) return "music";
        if (packageName.contains("gmail") || packageName.contains("mail")) return "email";
        if (packageName.contains("chrome") || packageName.contains("browser")) return "browser";
        if (packageName.contains("maps")) return "navigation";
        if (packageName.contains("camera")) return "camera";
        if (packageName.contains("gallery") || packageName.contains("photos")) return "gallery";
        if (packageName.contains("phone") || packageName.contains("dialer")) return "phone";
        if (packageName.contains("mms") || packageName.contains("message")) return "sms";
        if (packageName.contains("settings")) return "settings";
        if (packageName.contains("files") || packageName.contains("filemanager")) return "files";
        if (packageName.contains("calculator")) return "calculator";
        if (packageName.contains("calendar")) return "calendar";
        if (packageName.contains("clock") || packageName.contains("alarm")) return "clock";
        if (packageName.contains("bank") || packageName.contains("pay")) return "finance";
        if (packageName.contains("pdf") || packageName.contains("reader")) return "document";
        if (packageName.contains("doc") || packageName.contains("office")) return "document";
        return "other";
    }

    private String simplifyActivity(String activityName) {
        if (activityName == null || activityName.isEmpty()) return "main";
        String simple = activityName.substring(activityName.lastIndexOf('.') + 1);
        return simple.toLowerCase().replace("activity", "").replace("fragment", "").trim();
    }

    public static boolean isPrivateApp(String packageName) {
        String[] privateApps = {
            "com.google.android.apps.nbu.chromesync",
            "com.android.chrome",
            "com banking",
            "com.paytm",
            "com.phonepe",
            "com.google.android.apps.nbu.files",
        };
        for (String p : privateApps) {
            if (packageName.toLowerCase().contains(p.toLowerCase())) return true;
        }
        return false;
    }
}
