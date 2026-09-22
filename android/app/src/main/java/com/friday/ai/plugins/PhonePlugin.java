package com.friday.ai.plugins;

import android.Manifest;
import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.ContactsContract;
import android.provider.CallLog;
import android.telephony.SmsManager;

import androidx.core.app.ActivityCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "Phone")
public class PhonePlugin extends Plugin {

    @PluginMethod
    public void getContacts(PluginCall call) {
        if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("readContacts", call, "handleContactsPermission");
            return;
        }
        resolveContacts(call);
    }

    @PermissionCallback
    private void handleContactsPermission(PluginCall call) {
        resolveContacts(call);
    }

    private void resolveContacts(PluginCall call) {
        String query = call.getString("query", "").toLowerCase();
        List<JSObject> contacts = new ArrayList<>();
        ContentResolver cr = getContext().getContentResolver();
        Cursor cursor = cr.query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI, null, null, null, null);
        if (cursor != null) {
            while (cursor.moveToNext()) {
                try {
                    String name = cursor.getString(cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME));
                    String number = cursor.getString(cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.NUMBER));
                    long id = cursor.getLong(cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.CONTACT_ID));
                    if (query.isEmpty() || name.toLowerCase().contains(query)) {
                        JSObject c = new JSObject();
                        c.put("id", id);
                        c.put("name", name);
                        c.put("number", number);
                        contacts.add(c);
                    }
                } catch (Exception e) {
                    // skip bad row
                }
            }
            cursor.close();
        }
        JSObject result = new JSObject();
        result.put("contacts", contacts);
        call.resolve(result);
    }

    @PluginMethod
    public void makeCall(PluginCall call) {
        String number = call.getString("number");
        if (number == null || number.isEmpty()) {
            call.reject("Phone number required");
            return;
        }
        // Try direct call first
        try {
            if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED) {
                Intent intent = new Intent(Intent.ACTION_CALL, Uri.parse("tel:" + number));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                JSObject result = new JSObject();
                result.put("success", true);
                result.put("number", number);
                call.resolve(result);
            } else {
                // Request permission
                requestPermissionForAlias("callPhone", call, "handleCallPermission");
            }
        } catch (Exception e) {
            // Fallback to dialer if CALL_PHONE not available
            try {
                Intent intent = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + number));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                JSObject result = new JSObject();
                result.put("success", true);
                result.put("number", number);
                result.put("dialed", true);
                call.resolve(result);
            } catch (Exception ex) {
                call.reject("Cannot make call: " + ex.getMessage());
            }
        }
    }

    @PermissionCallback
    private void handleCallPermission(PluginCall call) {
        makeCall(call);
    }

    @PluginMethod
    public void getCallLog(PluginCall call) {
        if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("readCallLog", call, "handleCallLogPermission");
            return;
        }
        resolveCallLog(call);
    }

    @PermissionCallback
    private void handleCallLogPermission(PluginCall call) {
        resolveCallLog(call);
    }

    private void resolveCallLog(PluginCall call) {
        int limit = call.getInt("limit", 20);
        List<JSObject> calls = new ArrayList<>();
        ContentResolver cr = getContext().getContentResolver();
        try {
            Cursor cursor = cr.query(CallLog.Calls.CONTENT_URI, null, null, null, CallLog.Calls.DATE + " DESC");
            if (cursor != null) {
                int count = 0;
                while (cursor.moveToNext() && count < limit) {
                    try {
                        String number = cursor.getString(cursor.getColumnIndexOrThrow(CallLog.Calls.NUMBER));
                        String name = cursor.getString(cursor.getColumnIndexOrThrow(CallLog.Calls.CACHED_NAME));
                        int type = cursor.getInt(cursor.getColumnIndexOrThrow(CallLog.Calls.TYPE));
                        long date = cursor.getLong(cursor.getColumnIndexOrThrow(CallLog.Calls.DATE));
                        long duration = cursor.getLong(cursor.getColumnIndexOrThrow(CallLog.Calls.DURATION));
                        JSObject c = new JSObject();
                        c.put("number", number != null ? number : "Unknown");
                        c.put("name", name != null ? name : "Unknown");
                        c.put("type", type == CallLog.Calls.INCOMING_TYPE ? "incoming" : type == CallLog.Calls.OUTGOING_TYPE ? "outgoing" : "missed");
                        c.put("date", date);
                        c.put("duration", duration);
                        calls.add(c);
                        count++;
                    } catch (Exception e) {
                        // skip bad row
                    }
                }
                cursor.close();
            }
        } catch (Exception e) {
            call.reject("Cannot read call log: " + e.getMessage());
            return;
        }
        JSObject result = new JSObject();
        result.put("calls", calls);
        call.resolve(result);
    }

    @PluginMethod
    public void getRecentSms(PluginCall call) {
        if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("readSms", call, "handleSmsPermission");
            return;
        }
        resolveSms(call);
    }

    @PermissionCallback
    private void handleSmsPermission(PluginCall call) {
        resolveSms(call);
    }

    private void resolveSms(PluginCall call) {
        int limit = call.getInt("limit", 20);
        String filterAddress = call.getString("address", "");
        List<JSObject> messages = new ArrayList<>();
        ContentResolver cr = getContext().getContentResolver();
        try {
            Cursor cursor = cr.query(Uri.parse("content://sms/inbox"), null, null, null, "date DESC");
            if (cursor != null) {
                int count = 0;
                while (cursor.moveToNext() && count < limit) {
                    try {
                        String address = cursor.getString(cursor.getColumnIndexOrThrow("address"));
                        String body = cursor.getString(cursor.getColumnIndexOrThrow("body"));
                        long date = cursor.getLong(cursor.getColumnIndexOrThrow("date"));
                        if (filterAddress.isEmpty() || (address != null && address.contains(filterAddress))) {
                            JSObject m = new JSObject();
                            m.put("address", address != null ? address : "Unknown");
                            m.put("body", body != null ? body : "");
                            m.put("date", date);
                            m.put("read", cursor.getInt(cursor.getColumnIndexOrThrow("read")) == 1);
                            messages.add(m);
                            count++;
                        }
                    } catch (Exception e) {
                        // skip bad row
                    }
                }
                cursor.close();
            }
        } catch (Exception e) {
            call.reject("Cannot read SMS: " + e.getMessage());
            return;
        }
        JSObject result = new JSObject();
        result.put("messages", messages);
        call.resolve(result);
    }

    @PluginMethod
    public void sendSms(PluginCall call) {
        String number = call.getString("number");
        String message = call.getString("message");
        if (number == null || message == null) {
            call.reject("Number and message required");
            return;
        }
        try {
            if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED) {
                // Real send with carrier confirmation (sent-intent). Never report
                // success before the radio confirms — multipart-safe.
                call.setKeepAlive(true);
                SmsManager smsManager = SmsManager.getDefault();
                java.util.ArrayList<String> parts = smsManager.divideMessage(message);
                final int total = parts.size();
                final java.util.concurrent.atomic.AtomicInteger done = new java.util.concurrent.atomic.AtomicInteger(0);
                final java.util.concurrent.atomic.AtomicBoolean settled = new java.util.concurrent.atomic.AtomicBoolean(false);
                String action = "com.friday.ai.SMS_SENT_" + System.currentTimeMillis();
                BroadcastReceiver receiver = new BroadcastReceiver() {
                    @Override
                    public void onReceive(Context ctx, Intent intent) {
                        if (settled.get()) return;
                        if (getResultCode() == Activity.RESULT_OK) {
                            if (done.incrementAndGet() >= total && settled.compareAndSet(false, true)) {
                                try { getContext().unregisterReceiver(this); } catch (Exception ignored) {}
                                JSObject result = new JSObject();
                                result.put("sent", true);
                                result.put("verified", true);
                                result.put("number", number);
                                result.put("parts", total);
                                call.resolve(result);
                            }
                        } else if (settled.compareAndSet(false, true)) {
                            try { getContext().unregisterReceiver(this); } catch (Exception ignored) {}
                            call.reject("Carrier refused the SMS (radio code " + getResultCode() + ")");
                        }
                    }
                };
                IntentFilter filter = new IntentFilter(action);
                if (Build.VERSION.SDK_INT >= 33) {
                    getContext().registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
                } else {
                    getContext().registerReceiver(receiver, filter);
                }
                java.util.ArrayList<PendingIntent> sentIntents = new java.util.ArrayList<>();
                for (int i = 0; i < total; i++) {
                    Intent si = new Intent(action);
                    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
                    if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
                    sentIntents.add(PendingIntent.getBroadcast(getContext(), i, si, flags));
                }
                if (total == 1) {
                    smsManager.sendTextMessage(number, null, parts.get(0), sentIntents.get(0), null);
                } else {
                    smsManager.sendMultipartTextMessage(number, null, parts, sentIntents, null);
                }
                // Safety timeout: no carrier callback in 20s = honest timeout, not success.
                new Thread(() -> {
                    try { Thread.sleep(20000); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
                    if (settled.compareAndSet(false, true)) {
                        try { getContext().unregisterReceiver(receiver); } catch (Exception ignored) {}
                        call.reject("SMS timed out: carrier gave no confirmation within 20s");
                    }
                }).start();
            } else {
                // No permission: open SMS composer pre-filled. The user sends it.
                Intent intent = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + number));
                intent.putExtra("sms_body", message);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                JSObject result = new JSObject();
                result.put("sent", false);
                result.put("openedComposer", true);
                result.put("number", number);
                call.resolve(result);
            }
        } catch (Exception e) {
            call.reject("SMS send failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void searchContacts(PluginCall call) {
        getContacts(call);
    }
}
