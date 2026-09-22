package com.friday.ai.services;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.telephony.SmsMessage;
import android.util.Log;

import com.friday.ai.plugins.NotificationReaderPlugin;

import java.util.HashMap;
import java.util.Map;

public class SmsReceiver extends BroadcastReceiver {

    private static final String TAG = "FridaySmsReceiver";
    private static final Map<String, String> addressCache = new HashMap<>();

    @Override
    public void onReceive(Context context, Intent intent) {
        if ("android.provider.Telephony.SMS_RECEIVED".equals(intent.getAction())) {
            Bundle bundle = intent.getExtras();
            if (bundle != null) {
                try {
                    Object[] pdus = (Object[]) bundle.get("pdus");
                    String format = bundle.getString("format");
                    if (pdus != null) {
                        StringBuilder fullMessage = new StringBuilder();
                        String sender = "";
                        long timestamp = System.currentTimeMillis();
                        for (Object pdu : pdus) {
                            SmsMessage smsMessage = SmsMessage.createFromPdu((byte[]) pdu, format);
                            sender = smsMessage.getDisplayOriginatingAddress();
                            fullMessage.append(smsMessage.getDisplayMessageBody());
                            timestamp = smsMessage.getTimestampMillis();
                        }
                        String body = fullMessage.toString();
                        Log.d(TAG, "SMS from " + sender + ": " + body);
                        // Cache as notification
                        NotificationReaderPlugin.onNotificationPosted("com.android.mms", "SMS from " + sender, body, timestamp);
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error parsing SMS", e);
                }
            }
        }
    }
}
