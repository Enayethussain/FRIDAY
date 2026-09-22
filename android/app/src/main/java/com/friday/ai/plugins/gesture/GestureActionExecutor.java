package com.friday.ai.plugins.gesture;

import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.media.AudioManager;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

/**
 * GestureActionExecutor — executes the Android half of gesture actions.
 *
 * Rules (spec sections 5 + 12):
 *  - Check support + permission first.
 *  - Execute.
 *  - Verify where possible (volume readback, admin state).
 *  - NEVER report success unless the action really happened.
 *
 * HUD-side actions (wake_hud, zoom_*, swipe_*, open_panel, lock_hud) are NOT
 * executed here — the plugin forwards them to the WebView HUD, which reports
 * the real result back via reportHudResult(). This class only classifies
 * which actions are native vs HUD-dispatched.
 */
public final class GestureActionExecutor {

    public enum Kind { NATIVE, HUD }

    public static final class ActionResult {
        public final boolean success;
        public final String message;

        public ActionResult(boolean success, String message) {
            this.success = success;
            this.message = message;
        }
    }

    private final Context context;
    private final AudioManager audioManager;

    public GestureActionExecutor(Context context) {
        this.context = context.getApplicationContext();
        this.audioManager = (AudioManager) this.context.getSystemService(Context.AUDIO_SERVICE);
    }

    public static Kind kindOf(String action) {
        if ("volume_up".equals(action) || "volume_down".equals(action)) return Kind.NATIVE;
        return Kind.HUD;
    }

    /** Execute a native action synchronously with verification. */
    public ActionResult executeNative(String action) {
        if ("volume_up".equals(action)) return adjustVolume(true);
        if ("volume_down".equals(action)) return adjustVolume(false);
        return new ActionResult(false, "Unsupported native action: " + action);
    }

    private ActionResult adjustVolume(boolean up) {
        if (audioManager == null) {
            return new ActionResult(false, "Audio service unavailable on this device.");
        }
        int before = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC);
        int max = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        try {
            audioManager.adjustStreamVolume(
                    AudioManager.STREAM_MUSIC,
                    up ? AudioManager.ADJUST_RAISE : AudioManager.ADJUST_LOWER,
                    0);
        } catch (SecurityException se) {
            return new ActionResult(false, "Android blocked volume change (permission).");
        } catch (Exception e) {
            return new ActionResult(false, "Volume change failed: " + e.getMessage());
        }
        int after = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC);
        boolean moved = up ? after > before : after < before;
        boolean atEdge = (up && before >= max) || (!up && before <= 0);
        if (moved || atEdge) {
            return new ActionResult(true, up
                    ? "Volume badha diya (" + after + "/" + max + ")."
                    : "Volume kam kar diya (" + after + "/" + max + ").");
        }
        return new ActionResult(false, "Volume change verify nahi hua.");
    }

    /** Whether device-admin lock is actually available (for honest fist->lock_device). */
    public boolean isDeviceLockAvailable() {
        try {
            DevicePolicyManager dpm = (DevicePolicyManager)
                    context.getSystemService(Context.DEVICE_POLICY_SERVICE);
            if (dpm == null) return false;
            ComponentName admin = new ComponentName(
                    context, com.friday.ai.services.FridayDeviceAdminReceiver.class);
            return dpm.isAdminActive(admin);
        } catch (Exception e) {
            return false;
        }
    }

    /** Short haptic tick (spec: Vibration Feedback ON/OFF). Failures are silent. */
    public void tick(boolean enabled) {
        if (!enabled) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager)
                        context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                if (vm == null) return;
                Vibrator vibrator = vm.getDefaultVibrator();
                vibrator.vibrate(VibrationEffect.createOneShot(25, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                @SuppressWarnings("deprecation")
                Vibrator vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
                if (vibrator == null || !vibrator.hasVibrator()) return;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createOneShot(25, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    @SuppressWarnings("deprecation")
                    long ignored = 25L;
                    vibrator.vibrate(ignored);
                }
            }
        } catch (Exception ignored) {
            // Haptics must never break gesture flow.
        }
    }
}
