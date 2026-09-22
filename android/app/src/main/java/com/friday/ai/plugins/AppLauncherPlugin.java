package com.friday.ai.plugins;

import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "AppLauncher")
public class AppLauncherPlugin extends Plugin {

    private static final String TAG = "AppLauncher";

    // ---- Verification helpers: NEVER claim success without checking ----
    // Reads the actual foreground package from UsageEvents. Throws
    // SecurityException when usage access is not granted (handled by callers).

    private String foregroundPackage() {
        UsageStatsManager usm = (UsageStatsManager) getContext().getSystemService(Context.USAGE_STATS_SERVICE);
        if (usm == null) return "";
        long now = System.currentTimeMillis();
        UsageEvents events = usm.queryEvents(now - 15000, now);
        String pkg = "";
        while (events.hasNextEvent()) {
            UsageEvents.Event e = new UsageEvents.Event();
            events.getNextEvent(e);
            if (e.getEventType() == UsageEvents.Event.MOVE_TO_FOREGROUND ||
                e.getEventType() == UsageEvents.Event.ACTIVITY_RESUMED) {
                pkg = e.getPackageName() != null ? e.getPackageName() : "";
            }
        }
        return pkg;
    }

    private boolean awaitForeground(String target, long timeoutMs) {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            try {
                if (target.equals(foregroundPackage())) return true;
            } catch (SecurityException se) {
                throw se;
            } catch (Exception e) {
                Log.w(TAG, "foreground check failed", e);
            }
            try { Thread.sleep(250); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); return false; }
        }
        return false;
    }

    private boolean isInstalled(String packageName) {
        try {
            getContext().getPackageManager().getPackageInfo(packageName, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    @PluginMethod
    public void launchApp(PluginCall call) {
        String packageName = call.getString("packageName");
        String appName = call.getString("appName");
        boolean verify = call.getBoolean("verify", true);
        int verifyTimeoutMs = call.getInt("verifyTimeoutMs", 2500);
        if (packageName == null && appName == null) {
            call.reject("packageName or appName required");
            return;
        }
        try {
            PackageManager pm = getContext().getPackageManager();
            Intent intent = null;
            if (packageName != null) {
                if (!isInstalled(packageName)) {
                    call.reject("App not installed: " + packageName);
                    return;
                }
                intent = pm.getLaunchIntentForPackage(packageName);
            } else if (appName != null) {
                Intent mainIntent = new Intent(Intent.ACTION_MAIN, null);
                mainIntent.addCategory(Intent.CATEGORY_LAUNCHER);
                List<ResolveInfo> apps = pm.queryIntentActivities(mainIntent, 0);
                for (ResolveInfo info : apps) {
                    ApplicationInfo appInfo = info.activityInfo.applicationInfo;
                    String label = appInfo.loadLabel(pm).toString();
                    if (label.equalsIgnoreCase(appName) || label.toLowerCase().contains(appName.toLowerCase())) {
                        intent = pm.getLaunchIntentForPackage(info.activityInfo.packageName);
                        packageName = info.activityInfo.packageName;
                        break;
                    }
                }
            }
            if (intent == null) {
                call.reject("App found but cannot be launched: " + (packageName != null ? packageName : appName));
                return;
            }
            final String target = packageName;
            final boolean doVerify = verify;
            final int timeoutMs = verifyTimeoutMs;
            try {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                getContext().startActivity(intent);
            } catch (Exception e) {
                call.reject("Launch failed: " + e.getMessage());
                return;
            }
            if (!doVerify) {
                JSObject result = new JSObject();
                result.put("launched", true);
                result.put("verified", false);
                result.put("verifyReason", "skipped");
                result.put("packageName", target);
                call.resolve(result);
                return;
            }
            // Verify off the main thread (polling would ANR otherwise).
            new Thread(() -> {
                try {
                    boolean ok = awaitForeground(target, timeoutMs);
                    JSObject result = new JSObject();
                    result.put("launched", true);
                    result.put("verified", ok);
                    result.put("packageName", target);
                    try { result.put("currentPackage", foregroundPackage()); } catch (Exception ignored) {}
                    if (!ok) result.put("verifyReason", "foreground_mismatch_or_timeout");
                    call.resolve(result);
                } catch (SecurityException se) {
                    JSObject result = new JSObject();
                    result.put("launched", true);
                    result.put("verified", false);
                    result.put("packageName", target);
                    result.put("verifyReason", "usage_permission_required");
                    call.resolve(result);
                }
            }).start();
        } catch (Exception e) {
            call.reject("Launch failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getInstalledApps(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        Intent mainIntent = new Intent(Intent.ACTION_MAIN, null);
        mainIntent.addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> apps = pm.queryIntentActivities(mainIntent, 0);
        List<JSObject> appList = new ArrayList<>();
        for (ResolveInfo info : apps) {
            ApplicationInfo appInfo = info.activityInfo.applicationInfo;
            JSObject app = new JSObject();
            app.put("name", appInfo.loadLabel(pm).toString());
            app.put("packageName", info.activityInfo.packageName);
            app.put("system", (appInfo.flags & ApplicationInfo.FLAG_SYSTEM) != 0);
            appList.add(app);
        }
        JSObject result = new JSObject();
        result.put("apps", appList);
        call.resolve(result);
    }

    @PluginMethod
    public void searchApps(PluginCall call) {
        String query = call.getString("query", "").toLowerCase();
        if (query.isEmpty()) {
            call.reject("Search query required");
            return;
        }
        PackageManager pm = getContext().getPackageManager();
        Intent mainIntent = new Intent(Intent.ACTION_MAIN, null);
        mainIntent.addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> apps = pm.queryIntentActivities(mainIntent, 0);
        List<JSObject> found = new ArrayList<>();
        for (ResolveInfo info : apps) {
            ApplicationInfo appInfo = info.activityInfo.applicationInfo;
            String label = appInfo.loadLabel(pm).toString();
            if (label.toLowerCase().contains(query)) {
                JSObject app = new JSObject();
                app.put("name", label);
                app.put("packageName", info.activityInfo.packageName);
                found.add(app);
            }
        }
        JSObject result = new JSObject();
        result.put("apps", found);
        call.resolve(result);
    }

    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url");
        if (url == null) {
            call.reject("URL required");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("opened", url);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Open URL failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void goHome(PluginCall call) {
        String before = "";
        try { before = foregroundPackage(); } catch (Exception ignored) {}
        final String prev = before;
        Intent home = new Intent(Intent.ACTION_MAIN);
        home.addCategory(Intent.CATEGORY_HOME);
        home.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(home);
        } catch (Exception e) {
            call.reject("Go home failed: " + e.getMessage());
            return;
        }
        new Thread(() -> {
            // Verified when the foreground package actually changes away from the previous app.
            boolean ok = false;
            long deadline = System.currentTimeMillis() + 2000;
            while (System.currentTimeMillis() < deadline) {
                try {
                    String cur = foregroundPackage();
                    if (!cur.isEmpty() && !cur.equals(prev)) { ok = true; break; }
                } catch (Exception ignored) { break; }
                try { Thread.sleep(250); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); break; }
            }
            JSObject result = new JSObject();
            result.put("home", true);
            result.put("verified", ok);
            try { result.put("currentPackage", foregroundPackage()); } catch (Exception ignored) {}
            call.resolve(result);
        }).start();
    }

    @PluginMethod
    public void openWhatsAppChat(PluginCall call) {
        String phone = call.getString("phone");
        String message = call.getString("message", "");
        try {
            PackageManager pm = getContext().getPackageManager();
            // Check if WhatsApp is installed
            Intent checkIntent = pm.getLaunchIntentForPackage("com.whatsapp");
            if (checkIntent == null) {
                call.reject("WhatsApp not installed");
                return;
            }

            if (phone != null && !phone.isEmpty()) {
                // Use WhatsApp's native share intent - opens directly in WhatsApp app
                String cleanPhone = phone.replaceAll("[^0-9+]", "");
                Intent intent = new Intent(Intent.ACTION_SENDTO);
                intent.setData(Uri.parse("smsto:" + cleanPhone));
                intent.setPackage("com.whatsapp");
                intent.putExtra("sms_body", message);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                try {
                    getContext().startActivity(intent);
                } catch (Exception e) {
                    // Fallback: use whatsapp:// scheme
                    Intent fallback = new Intent(Intent.ACTION_VIEW, Uri.parse("whatsapp://send?phone=" + cleanPhone + "&text=" + Uri.encode(message)));
                    fallback.setPackage("com.whatsapp");
                    fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                    getContext().startActivity(fallback);
                }
            } else {
                // Just open WhatsApp main screen
                Intent intent = pm.getLaunchIntentForPackage("com.whatsapp");
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                getContext().startActivity(intent);
            }
            new Thread(() -> {
                boolean ok = false;
                String err = "";
                try {
                    ok = awaitForeground("com.whatsapp", 2500);
                    if (!ok) err = "foreground_mismatch_or_timeout";
                } catch (SecurityException se) {
                    err = "usage_permission_required";
                }
                JSObject result = new JSObject();
                result.put("launched", true);
                result.put("verified", ok);
                if (!err.isEmpty()) result.put("verifyReason", err);
                try { result.put("currentPackage", foregroundPackage()); } catch (Exception ignored) {}
                call.resolve(result);
            }).start();
        } catch (Exception e) {
            Log.e(TAG, "WhatsApp launch failed", e);
            call.reject("WhatsApp launch failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openInstagram(PluginCall call) {
        String section = call.getString("section", "main");
        try {
            PackageManager pm = getContext().getPackageManager();
            // Check if Instagram is installed
            Intent checkIntent = pm.getLaunchIntentForPackage("com.instagram.android");
            if (checkIntent == null) {
                call.reject("Instagram not installed");
                return;
            }

            Intent intent = null;
            switch (section.toLowerCase()) {
                case "reels":
                    // Try Instagram deep link for reels
                    intent = new Intent(Intent.ACTION_VIEW, Uri.parse("ig_reels://"));
                    intent.setPackage("com.instagram.android");
                    break;
                case "stories":
                    intent = new Intent(Intent.ACTION_VIEW, Uri.parse("ig_story_camera://"));
                    intent.setPackage("com.instagram.android");
                    break;
                case "messages":
                case "dm":
                    intent = new Intent(Intent.ACTION_VIEW, Uri.parse("ig_direct://"));
                    intent.setPackage("com.instagram.android");
                    break;
                case "profile":
                    intent = new Intent(Intent.ACTION_VIEW, Uri.parse("ig_user://"));
                    intent.setPackage("com.instagram.android");
                    break;
                default:
                    // Just open Instagram normally
                    intent = pm.getLaunchIntentForPackage("com.instagram.android");
                    break;
            }

            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                String openedSection = section;
                try {
                    getContext().startActivity(intent);
                } catch (Exception e) {
                    // Fallback: just open Instagram main (report honestly what opened)
                    Intent fallback = pm.getLaunchIntentForPackage("com.instagram.android");
                    fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                    getContext().startActivity(fallback);
                    openedSection = "main-fallback";
                }
                final String opened = openedSection;
                new Thread(() -> {
                    boolean ok = false;
                    String err = "";
                    try {
                        ok = awaitForeground("com.instagram.android", 2500);
                        if (!ok) err = "foreground_mismatch_or_timeout";
                    } catch (SecurityException se) {
                        err = "usage_permission_required";
                    }
                    JSObject result = new JSObject();
                    result.put("launched", true);
                    result.put("verified", ok);
                    result.put("section", section);
                    result.put("openedSection", opened);
                    if (!err.isEmpty()) result.put("verifyReason", err);
                    try { result.put("currentPackage", foregroundPackage()); } catch (Exception ignored) {}
                    call.resolve(result);
                }).start();
            } else {
                call.reject("Instagram not installed");
            }
        } catch (Exception e) {
            Log.e(TAG, "Instagram launch failed", e);
            call.reject("Instagram launch failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openTelegram(PluginCall call) {
        String username = call.getString("username");
        try {
            PackageManager pm = getContext().getPackageManager();
            Intent checkIntent = pm.getLaunchIntentForPackage("org.telegram.messenger");
            if (checkIntent == null) {
                call.reject("Telegram not installed");
                return;
            }

            Intent intent;
            if (username != null && !username.isEmpty()) {
                intent = new Intent(Intent.ACTION_VIEW, Uri.parse("tg://resolve?domain=" + username));
                intent.setPackage("org.telegram.messenger");
            } else {
                intent = pm.getLaunchIntentForPackage("org.telegram.messenger");
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("launched", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Telegram launch failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openGmail(PluginCall call) {
        try {
            PackageManager pm = getContext().getPackageManager();
            Intent intent = pm.getLaunchIntentForPackage("com.google.android.gm");
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                getContext().startActivity(intent);
                JSObject result = new JSObject();
                result.put("launched", true);
                call.resolve(result);
            } else {
                call.reject("Gmail not installed");
            }
        } catch (Exception e) {
            call.reject("Gmail launch failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openYouTube(PluginCall call) {
        String query = call.getString("query", "");
        try {
            PackageManager pm = getContext().getPackageManager();
            Intent intent = pm.getLaunchIntentForPackage("com.google.android.youtube");
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                getContext().startActivity(intent);
                JSObject result = new JSObject();
                result.put("launched", true);
                call.resolve(result);
            } else {
                call.reject("YouTube not installed");
            }
        } catch (Exception e) {
            call.reject("YouTube launch failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openFacebook(PluginCall call) {
        try {
            PackageManager pm = getContext().getPackageManager();
            Intent intent = pm.getLaunchIntentForPackage("com.facebook.katana");
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                getContext().startActivity(intent);
                JSObject result = new JSObject();
                result.put("launched", true);
                call.resolve(result);
            } else {
                call.reject("Facebook not installed");
            }
        } catch (Exception e) {
            call.reject("Facebook launch failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openMaps(PluginCall call) {
        try {
            PackageManager pm = getContext().getPackageManager();
            Intent intent = pm.getLaunchIntentForPackage("com.google.android.apps.maps");
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                getContext().startActivity(intent);
                JSObject result = new JSObject();
                result.put("launched", true);
                call.resolve(result);
            } else {
                call.reject("Maps not installed");
            }
        } catch (Exception e) {
            call.reject("Maps launch failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openSpotify(PluginCall call) {
        try {
            PackageManager pm = getContext().getPackageManager();
            Intent intent = pm.getLaunchIntentForPackage("com.spotify.music");
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                getContext().startActivity(intent);
                JSObject result = new JSObject();
                result.put("launched", true);
                call.resolve(result);
            } else {
                call.reject("Spotify not installed");
            }
        } catch (Exception e) {
            call.reject("Spotify launch failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openCamera(PluginCall call) {
        try {
            // Use system camera intent
            Intent intent = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("launched", true);
            call.resolve(result);
        } catch (Exception e) {
            // Fallback to camera app
            try {
                PackageManager pm = getContext().getPackageManager();
                Intent intent = pm.getLaunchIntentForPackage("com.android.camera2");
                if (intent == null) intent = pm.getLaunchIntentForPackage("com.android.camera");
                if (intent != null) {
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(intent);
                    JSObject result = new JSObject();
                    result.put("launched", true);
                    call.resolve(result);
                } else {
                    call.reject("Camera not found");
                }
            } catch (Exception ex) {
                call.reject("Camera launch failed: " + ex.getMessage());
            }
        }
    }
}
