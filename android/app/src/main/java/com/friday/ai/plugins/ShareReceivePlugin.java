package com.friday.ai.plugins;

import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;

import com.friday.ai.ShareReceiveActivity;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

/**
 * ShareReceive plugin: exposes files shared INTO FRIDAY (Gallery -> Share ->
 * FRIDAY) to the WebView. Returns display name + size + content URI; the
 * WebView reads bytes via fetch() using the one-shot grant — the plugin
 * never uploads anything. Clears the stash after handoff (no retention).
 */
@CapacitorPlugin(name = "ShareReceive")
public class ShareReceivePlugin extends Plugin {

    @PluginMethod
    public void getSharedFiles(PluginCall call) {
        try {
            JSArray files = new JSArray();
            synchronized (ShareReceiveActivity.PENDING) {
                for (Uri uri : ShareReceiveActivity.PENDING) {
                    try {
                        JSONObject f = new JSONObject();
                        f.put("uri", uri.toString());
                        f.put("name", displayName(uri));
                        f.put("size", sizeOf(uri));
                        f.put("type", typeOf(uri));
                        files.put(f);
                    } catch (Exception e) {
                        // Skip unreadable entries honestly; keep the rest.
                    }
                }
                ShareReceiveActivity.PENDING.clear();
            }
            JSObject ok = new JSObject();
            ok.put("files", files);
            call.resolve(ok);
        } catch (Exception e) {
            call.reject("Shared files read nahi ho payi: " + e.getMessage());
        }
    }

    private String displayName(Uri uri) {
        String name = uri.getLastPathSegment();
        try {
            ContentResolver cr = getContext().getContentResolver();
            try (Cursor c = cr.query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    int idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    if (idx >= 0 && c.getString(idx) != null) name = c.getString(idx);
                }
            }
        } catch (Exception ignored) {
        }
        if (name == null) name = "shared-file";
        // Strip any path the sender embedded (traversal-safe display name).
        name = name.replaceAll("[\\\\/]", "_");
        return name.length() > 120 ? name.substring(name.length() - 120) : name;
    }

    private long sizeOf(Uri uri) {
        try {
            ContentResolver cr = getContext().getContentResolver();
            try (Cursor c = cr.query(uri, new String[]{OpenableColumns.SIZE}, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    int idx = c.getColumnIndex(OpenableColumns.SIZE);
                    if (idx >= 0) return c.getLong(idx);
                }
            }
        } catch (Exception ignored) {
        }
        return -1;
    }

    private String typeOf(Uri uri) {
        try {
            String t = getContext().getContentResolver().getType(uri);
            if (t != null) return t;
        } catch (Exception ignored) {
        }
        String ext = MimeTypeMap.getFileExtensionFromUrl(uri.toString());
        String t = ext != null ? MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.toLowerCase()) : null;
        return t != null ? t : "application/octet-stream";
    }
}
