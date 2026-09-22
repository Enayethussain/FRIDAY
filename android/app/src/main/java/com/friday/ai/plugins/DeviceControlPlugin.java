package com.friday.ai.plugins;

import android.Manifest;
import android.app.admin.DevicePolicyManager;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.camera2.CameraManager;
import android.media.AudioManager;
import android.media.AudioManager.OnAudioFocusChangeListener;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.WindowManager;

import androidx.core.app.ActivityCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DeviceControl")
public class DeviceControlPlugin extends Plugin {

    private CameraManager cameraManager;
    private boolean flashlightOn = false;
    private AudioManager audioManager;

    @PluginMethod
    public void toggleFlashlight(PluginCall call) {
        try {
            if (cameraManager == null) {
                cameraManager = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
            }
            String[] cameraIds = cameraManager.getCameraIdList();
            if (cameraIds.length > 0) {
                flashlightOn = !flashlightOn;
                cameraManager.setTorchMode(cameraIds[0], flashlightOn);
                JSObject result = new JSObject();
                result.put("flashlightOn", flashlightOn);
                call.resolve(result);
            } else {
                call.reject("No camera available");
            }
        } catch (Exception e) {
            call.reject("Flashlight failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void setFlashlight(PluginCall call) {
        Boolean on = call.getBoolean("on");
        if (on == null) {
            call.reject("Boolean 'on' required");
            return;
        }
        try {
            if (cameraManager == null) {
                cameraManager = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
            }
            String[] cameraIds = cameraManager.getCameraIdList();
            if (cameraIds.length > 0) {
                cameraManager.setTorchMode(cameraIds[0], on);
                flashlightOn = on;
                JSObject result = new JSObject();
                result.put("flashlightOn", flashlightOn);
                call.resolve(result);
            } else {
                call.reject("No camera available");
            }
        } catch (Exception e) {
            call.reject("Flashlight failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getVolume(PluginCall call) {
        if (audioManager == null) {
            audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        }
        JSObject result = new JSObject();
        result.put("current", audioManager.getStreamVolume(AudioManager.STREAM_MUSIC));
        result.put("max", audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC));
        result.put("ring", audioManager.getStreamVolume(AudioManager.STREAM_RING));
        result.put("ringMax", audioManager.getStreamMaxVolume(AudioManager.STREAM_RING));
        result.put("alarm", audioManager.getStreamVolume(AudioManager.STREAM_ALARM));
        call.resolve(result);
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        Integer level = call.getInt("level");
        String stream = call.getString("stream", "music");
        if (level == null) {
            call.reject("Volume level required");
            return;
        }
        if (audioManager == null) {
            audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        }
        int streamType;
        switch (stream.toLowerCase()) {
            case "ring": streamType = AudioManager.STREAM_RING; break;
            case "alarm": streamType = AudioManager.STREAM_ALARM; break;
            case "system": streamType = AudioManager.STREAM_SYSTEM; break;
            case "notification": streamType = AudioManager.STREAM_NOTIFICATION; break;
            default: streamType = AudioManager.STREAM_MUSIC;
        }
        int max = audioManager.getStreamMaxVolume(streamType);
        int clamped = Math.max(0, Math.min(level, max));
        audioManager.setStreamVolume(streamType, clamped, 0);
        int actual = audioManager.getStreamVolume(streamType);
        JSObject result = new JSObject();
        result.put("level", actual);
        result.put("requested", clamped);
        result.put("applied", actual == clamped);
        result.put("max", max);
        result.put("stream", stream);
        call.resolve(result);
    }

    @PluginMethod
    public void adjustVolume(PluginCall call) {
        Integer delta = call.getInt("delta", 1);
        String stream = call.getString("stream", "music");
        if (audioManager == null) {
            audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        }
        int streamType;
        switch (stream.toLowerCase()) {
            case "ring": streamType = AudioManager.STREAM_RING; break;
            case "alarm": streamType = AudioManager.STREAM_ALARM; break;
            default: streamType = AudioManager.STREAM_MUSIC;
        }
        if (delta > 0) {
            audioManager.adjustStreamVolume(streamType, AudioManager.ADJUST_RAISE, 0);
        } else {
            audioManager.adjustStreamVolume(streamType, AudioManager.ADJUST_LOWER, 0);
        }
        JSObject result = new JSObject();
        result.put("newVolume", audioManager.getStreamVolume(streamType));
        result.put("stream", stream);
        call.resolve(result);
    }

    @PluginMethod
    public void setRingerMode(PluginCall call) {
        String mode = call.getString("mode", "normal");
        if (audioManager == null) {
            audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        }
        try {
            int ringerMode;
            switch (mode.toLowerCase()) {
                case "silent": ringerMode = AudioManager.RINGER_MODE_SILENT; break;
                case "vibrate": ringerMode = AudioManager.RINGER_MODE_VIBRATE; break;
                default: ringerMode = AudioManager.RINGER_MODE_NORMAL;
            }
            audioManager.setRingerMode(ringerMode);
            JSObject result = new JSObject();
            result.put("mode", mode.toLowerCase());
            result.put("muted", ringerMode != AudioManager.RINGER_MODE_NORMAL);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Ringer mode failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getRingerMode(PluginCall call) {
        if (audioManager == null) {
            audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        }
        int mode = audioManager.getRingerMode();
        JSObject result = new JSObject();
        result.put("mode", mode == AudioManager.RINGER_MODE_SILENT ? "silent" : mode == AudioManager.RINGER_MODE_VIBRATE ? "vibrate" : "normal");
        result.put("muted", mode != AudioManager.RINGER_MODE_NORMAL);
        call.resolve(result);
    }

    @PluginMethod
    public void getBrightness(PluginCall call) {
        try {
            int brightness = Settings.System.getInt(getContext().getContentResolver(), Settings.System.SCREEN_BRIGHTNESS);
            JSObject result = new JSObject();
            result.put("brightness", brightness);
            result.put("max", 255);
            result.put("percentage", (int)(brightness / 255.0 * 100));
            call.resolve(result);
        } catch (Settings.SettingNotFoundException e) {
            call.reject("Cannot read brightness: " + e.getMessage());
        }
    }

    @PluginMethod
    public void setBrightness(PluginCall call) {
        Integer level = call.getInt("level");
        if (level == null) {
            call.reject("Brightness level required (0-255)");
            return;
        }
        try {
            int clamped = Math.max(0, Math.min(level, 255));
            Settings.System.putInt(getContext().getContentResolver(), Settings.System.SCREEN_BRIGHTNESS, clamped);
            int actual = Settings.System.getInt(getContext().getContentResolver(), Settings.System.SCREEN_BRIGHTNESS);
            JSObject result = new JSObject();
            result.put("brightness", actual);
            result.put("requested", clamped);
            result.put("applied", Math.abs(actual - clamped) <= 2);
            result.put("percentage", (int)(actual / 255.0 * 100));
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Set brightness failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void lockScreen(PluginCall call) {
        try {
            DevicePolicyManager dpm = (DevicePolicyManager) getContext().getSystemService(Context.DEVICE_POLICY_SERVICE);
            ComponentName admin = new ComponentName(getContext(), com.friday.ai.services.FridayDeviceAdminReceiver.class);
            if (dpm != null && dpm.isAdminActive(admin)) {
                dpm.lockNow();
                JSObject result = new JSObject();
                result.put("locked", true);
                result.put("method", "device_admin");
                call.resolve(result);
            } else {
                // No fake lock: without device-admin Android gives no API to lock.
                call.reject("Device-admin permission required to lock screen. Enable it in JARVIS settings.");
            }
        } catch (Exception e) {
            call.reject("Lock screen failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void wakeUpScreen(PluginCall call) {
        try {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            boolean alreadyOn = pm != null && pm.isInteractive();
            PowerManager.WakeLock wakeLock = pm.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE,
                "jarvis:wakeup"
            );
            wakeLock.acquire(10000);
            try { wakeLock.release(); } catch (Exception ignored) {}
            boolean nowOn = pm != null && pm.isInteractive();
            JSObject result = new JSObject();
            result.put("awake", nowOn);
            result.put("wasAlreadyOn", alreadyOn);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Wake up failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getBluetoothStatus(PluginCall call) {
        BluetoothManager btManager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = btManager != null ? btManager.getAdapter() : null;
        JSObject result = new JSObject();
        if (adapter != null) {
            result.put("available", true);
            result.put("enabled", adapter.isEnabled());
            result.put("name", adapter.getName());
        } else {
            result.put("available", false);
            result.put("enabled", false);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void toggleBluetooth(PluginCall call) {
        BluetoothManager btManager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = btManager != null ? btManager.getAdapter() : null;
        if (adapter == null) {
            call.reject("Bluetooth not available");
            return;
        }
        boolean before = adapter.isEnabled();
        try {
            if (before) {
                adapter.disable();
            } else {
                adapter.enable();
            }
        } catch (SecurityException se) {
            call.reject("Bluetooth permission required. Grant Nearby Devices permission first.");
            return;
        } catch (Exception e) {
            call.reject("Bluetooth toggle failed: " + e.getMessage());
            return;
        }
        // enable()/disable() are async and may be ignored on new Android — re-read off-thread, never assume.
        new Thread(() -> {
            try { Thread.sleep(700); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
            boolean after = adapter.isEnabled();
            JSObject result = new JSObject();
            result.put("enabled", after);
            result.put("changed", after != before);
            if (after == before) result.put("note", "Android ignored the toggle (open Bluetooth settings instead)");
            call.resolve(result);
        }).start();
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        String setting = call.getString("setting", "main");
        Intent intent;
        switch (setting.toLowerCase()) {
            case "wifi":
                intent = new Intent(Settings.ACTION_WIFI_SETTINGS);
                break;
            case "bluetooth":
                intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
                break;
            case "sound":
                intent = new Intent(Settings.ACTION_SOUND_SETTINGS);
                break;
            case "display":
                intent = new Intent(Settings.ACTION_DISPLAY_SETTINGS);
                break;
            case "battery":
                intent = new Intent(Settings.ACTION_BATTERY_SAVER_SETTINGS);
                break;
            case "security":
                intent = new Intent(Settings.ACTION_SECURITY_SETTINGS);
                break;
            case "accessibility":
                intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
                break;
            case "developer":
                intent = new Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS);
                break;
            case "app":
                intent = new Intent(Settings.ACTION_APPLICATION_SETTINGS);
                break;
            case "location":
                intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
                break;
            case "nfc":
                intent = new Intent(Settings.ACTION_NFC_SETTINGS);
                break;
            default:
                intent = new Intent(Settings.ACTION_SETTINGS);
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        JSObject result = new JSObject();
        result.put("opened", setting);
        call.resolve(result);
    }

    // ---- Real permission state: the Permission Center reads these, never assumes ----

    @PluginMethod
    public void checkPermission(PluginCall call) {
        String name = call.getString("name", "");
        String manifestPerm;
        switch (name.toLowerCase()) {
            case "camera": manifestPerm = Manifest.permission.CAMERA; break;
            case "contacts": manifestPerm = Manifest.permission.READ_CONTACTS; break;
            case "phone": manifestPerm = Manifest.permission.CALL_PHONE; break;
            case "call_log": manifestPerm = Manifest.permission.READ_CALL_LOG; break;
            case "sms": manifestPerm = Manifest.permission.SEND_SMS; break;
            case "microphone": manifestPerm = Manifest.permission.RECORD_AUDIO; break;
            case "location": manifestPerm = Manifest.permission.ACCESS_FINE_LOCATION; break;
            case "storage":
                manifestPerm = Build.VERSION.SDK_INT >= 33
                    ? Manifest.permission.READ_MEDIA_IMAGES
                    : Manifest.permission.READ_EXTERNAL_STORAGE;
                break;
            case "bluetooth":
                manifestPerm = Build.VERSION.SDK_INT >= 31
                    ? Manifest.permission.BLUETOOTH_CONNECT
                    : Manifest.permission.BLUETOOTH;
                break;
            default:
                call.reject("Unknown permission: " + name);
                return;
        }
        boolean granted = ActivityCompat.checkSelfPermission(getContext(), manifestPerm) == PackageManager.PERMISSION_GRANTED;
        JSObject result = new JSObject();
        result.put("name", name.toLowerCase());
        result.put("granted", granted);
        call.resolve(result);
    }

    @PluginMethod
    public void canWriteSettings(PluginCall call) {
        boolean ok = Build.VERSION.SDK_INT < 23 || Settings.System.canWrite(getContext());
        JSObject result = new JSObject();
        result.put("canWrite", ok);
        call.resolve(result);
    }

    @PluginMethod
    public void openWriteSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("opened", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Cannot open write-settings page: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("opened", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Cannot open app settings: " + e.getMessage());
        }
    }

    @PluginMethod
    public void isDeviceAdmin(PluginCall call) {
        try {
            android.app.admin.DevicePolicyManager dpm =
                (android.app.admin.DevicePolicyManager) getContext().getSystemService(Context.DEVICE_POLICY_SERVICE);
            ComponentName admin = new ComponentName(getContext(), com.friday.ai.services.FridayDeviceAdminReceiver.class);
            JSObject result = new JSObject();
            result.put("active", dpm != null && dpm.isAdminActive(admin));
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Cannot check device-admin: " + e.getMessage());
        }
    }

    @PluginMethod
    public void enableDeviceAdmin(PluginCall call) {
        try {
            ComponentName admin = new ComponentName(getContext(), com.friday.ai.services.FridayDeviceAdminReceiver.class);
            Intent intent = new Intent(android.app.admin.DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN);
            intent.putExtra(android.app.admin.DevicePolicyManager.EXTRA_DEVICE_ADMIN, admin);
            intent.putExtra(android.app.admin.DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                "JARVIS needs device-admin to lock the screen on your command. Nothing else changes.");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("opened", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Cannot open device-admin page: " + e.getMessage());
        }
    }
}
