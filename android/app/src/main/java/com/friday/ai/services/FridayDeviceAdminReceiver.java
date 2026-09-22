package com.friday.ai.services;

import android.app.admin.DeviceAdminReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Minimal device-admin receiver. Sole purpose: allow JARVIS to lock the
 * screen for real (DevicePolicyManager.lockNow) after the user explicitly
 * enables it. No password policies, no wipe, nothing else.
 */
public class FridayDeviceAdminReceiver extends DeviceAdminReceiver {
    @Override
    public void onEnabled(Context context, Intent intent) {
    }

    @Override
    public void onDisabled(Context context, Intent intent) {
    }
}
