package com.friday.ai.plugins;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * Capacitor bridge for FRIDAY in-app updates ("AppUpdate").
 *
 * Flow is driven by the web layer: it fetches a remote version.json,
 * compares versionCode, and only then calls download/install. This plugin
 * never decides versions by itself and never fakes a download.
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    private static final String APK_FILE_NAME = "FRIDAY-update.apk";
    private long lastDownloadId = -1L;

    /** Local app version for comparison with remote latestVersionCode. */
    @PluginMethod
    public void getVersion(PluginCall call) {
        try {
            Context ctx = getContext();
            PackageInfo info = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            long code;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                code = info.getLongVersionCode();
            } else {
                code = info.versionCode;
            }
            JSObject ret = new JSObject();
            ret.put("versionCode", code);
            ret.put("versionName", info.versionName != null ? info.versionName : "");
            ret.put("packageName", ctx.getPackageName());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("VERSION_LOOKUP_FAILED", e);
        }
    }

    /** Enqueue an APK download via the system DownloadManager. */
    @PluginMethod
    public void downloadApk(PluginCall call) {
        String url = call.getString("url", "");
        if (url.isEmpty() || !(url.startsWith("https://") || url.startsWith("http://"))) {
            call.reject("INVALID_URL");
            return;
        }
        try {
            Context ctx = getContext();
            DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm == null) {
                call.reject("DOWNLOAD_UNAVAILABLE");
                return;
            }
            // Remove any stale partial file from a previous attempt.
            try {
                File stale = new File(ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), APK_FILE_NAME);
                if (stale.exists()) stale.delete();
            } catch (Exception ignored) { /* best effort */ }
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.setTitle("FRIDAY update");
            req.setDescription("Downloading new FRIDAY version…");
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalFilesDir(ctx, Environment.DIRECTORY_DOWNLOADS, APK_FILE_NAME);
            req.setAllowedOverMetered(true);
            req.setAllowedOverRoaming(false);
            lastDownloadId = dm.enqueue(req);
            JSObject ret = new JSObject();
            ret.put("downloadId", lastDownloadId);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("DOWNLOAD_FAILED", e);
        }
    }

    /** Poll download progress for UI (bytes + status, no fake completion). */
    @PluginMethod
    public void downloadStatus(PluginCall call) {
        long id = call.getLong("downloadId", lastDownloadId);
        JSObject ret = new JSObject();
        ret.put("downloadId", id);
        if (id < 0) {
            ret.put("status", "UNKNOWN");
            call.resolve(ret);
            return;
        }
        Cursor c = null;
        try {
            Context ctx = getContext();
            DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm == null) {
                ret.put("status", "UNKNOWN");
                call.resolve(ret);
                return;
            }
            DownloadManager.Query q = new DownloadManager.Query().setFilterById(id);
            c = dm.query(q);
            if (c == null || !c.moveToFirst()) {
                ret.put("status", "UNKNOWN");
                call.resolve(ret);
                return;
            }
            int statusIdx = c.getColumnIndex(DownloadManager.COLUMN_STATUS);
            int bytesIdx = c.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR);
            int totalIdx = c.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES);
            int status = c.getInt(statusIdx);
            long done = c.getLong(bytesIdx);
            long total = c.getLong(totalIdx);
            ret.put("bytesDownloaded", done);
            ret.put("bytesTotal", total);
            switch (status) {
                case DownloadManager.STATUS_SUCCESSFUL:
                    ret.put("status", "SUCCESSFUL");
                    break;
                case DownloadManager.STATUS_FAILED:
                    ret.put("status", "FAILED");
                    break;
                case DownloadManager.STATUS_PAUSED:
                    ret.put("status", "PAUSED");
                    break;
                case DownloadManager.STATUS_PENDING:
                    ret.put("status", "PENDING");
                    break;
                case DownloadManager.STATUS_RUNNING:
                    ret.put("status", "RUNNING");
                    break;
                default:
                    ret.put("status", "UNKNOWN");
                    break;
            }
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("STATUS_FAILED", e);
        } finally {
            if (c != null) {
                try { c.close(); } catch (Exception ignored) { /* noop */ }
            }
        }
    }

    /**
     * Launch the package installer for the downloaded APK. Reports honestly:
     * NEED_INSTALL_PERMISSION when Android 8+ unknown-sources approval is
     * missing (caller should open settings), LAUNCHED only when the installer
     * intent actually starts.
     */
    @PluginMethod
    public void installApk(PluginCall call) {
        try {
            Context ctx = getContext();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                try {
                    if (!ctx.getPackageManager().canRequestPackageInstalls()) {
                        JSObject ret = new JSObject();
                        ret.put("status", "NEED_INSTALL_PERMISSION");
                        call.resolve(ret);
                        return;
                    }
                } catch (Exception ignored) { /* fall through and try */ }
            }
            File apk = new File(ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), APK_FILE_NAME);
            if (!apk.exists() || apk.length() == 0) {
                call.reject("APK_NOT_FOUND");
                return;
            }
            Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Activity activity = getActivity();
            if (activity != null) {
                activity.startActivity(intent);
            } else {
                ctx.startActivity(intent);
            }
            JSObject ret = new JSObject();
            ret.put("status", "LAUNCHED");
            call.resolve(ret);
        } catch (ActivityNotFoundException e) {
            call.reject("NO_INSTALLER", e);
        } catch (Exception e) {
            call.reject("INSTALL_FAILED", e);
        }
    }

    /** Open the unknown-sources approval screen for this app (Android 8+). */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            Context ctx = getContext();
            Intent intent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + ctx.getPackageName()));
            } else {
                intent = new Intent(Settings.ACTION_SECURITY_SETTINGS);
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            Activity activity = getActivity();
            if (activity != null) {
                activity.startActivity(intent);
            } else {
                ctx.startActivity(intent);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("SETTINGS_FAILED", e);
        }
    }
}
