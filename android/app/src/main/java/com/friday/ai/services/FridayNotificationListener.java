package com.friday.ai.services;

import android.app.Notification;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import com.friday.ai.plugins.NotificationReaderPlugin;

public class FridayNotificationListener extends NotificationListenerService {

    private static final String TAG = "FridayNotifListener";

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            String packageName = sbn.getPackageName();
            String title = "";
            String text = "";

            if (sbn.getNotification() != null && sbn.getNotification().extras != null) {
                CharSequence titleCs = sbn.getNotification().extras.getCharSequence(Notification.EXTRA_TITLE);
                CharSequence textCs = sbn.getNotification().extras.getCharSequence(Notification.EXTRA_TEXT);
                title = titleCs != null ? titleCs.toString() : "";
                text = textCs != null ? textCs.toString() : "";
            }

            NotificationReaderPlugin.onNotificationPosted(packageName, title, text, sbn.getPostTime());
            Log.d(TAG, "Notification: " + packageName + " | " + title + " | " + text);
        } catch (Exception e) {
            Log.e(TAG, "Error processing notification", e);
        }
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        // Optional: handle notification removal
    }

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        Log.d(TAG, "JARVIS Notification Listener connected");
    }

    @Override
    public void onListenerDisconnected() {
        super.onListenerDisconnected();
        Log.d(TAG, "JARVIS Notification Listener disconnected");
    }
}
