package com.friday.ai.services;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.telephony.TelephonyManager;
import android.util.Log;

import com.friday.ai.plugins.NotificationReaderPlugin;

public class PhoneStateReceiver extends BroadcastReceiver {

    private static final String TAG = "FridayPhoneState";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        
        String action = intent.getAction();
        if (TelephonyManager.ACTION_PHONE_STATE_CHANGED.equals(action)) {
            String state = intent.getStringExtra(TelephonyManager.EXTRA_STATE);
            String number = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER);
            
            if (TelephonyManager.EXTRA_STATE_RINGING.equals(state)) {
                Log.d(TAG, "Incoming call from: " + (number != null ? number : "Unknown"));
                NotificationReaderPlugin.onNotificationPosted(
                    "com.android.incallui",
                    "Incoming Call",
                    number != null ? "From: " + number : "Unknown caller",
                    System.currentTimeMillis()
                );
            } else if (TelephonyManager.EXTRA_STATE_OFFHOOK.equals(state)) {
                Log.d(TAG, "Call answered/offhook");
            } else if (TelephonyManager.EXTRA_STATE_IDLE.equals(state)) {
                Log.d(TAG, "Call ended");
            }
        }
    }
}
