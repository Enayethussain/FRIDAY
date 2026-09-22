package com.friday.ai.services;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "FridayBootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            Log.d(TAG, "JARVIS: Device booted, re-enabling services");
            // The notification listener will be re-enabled by the system
            // No need to start it manually as it's managed by the system
        }
    }
}
