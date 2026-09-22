package com.friday.ai.plugins.gesture;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.HashMap;
import java.util.Map;

/**
 * GestureSettingsStore — local persistence for gesture control (no network, no cloud).
 *
 * Settings (spec section 4):
 *  enabled, camera (front/back), sensitivity (low/medium/high),
 *  cooldownMs, showFeedback, haptic, testMode, per-gesture action mapping.
 */
public final class GestureSettingsStore {

    public static final String PREFS = "friday_gestures";

    public static final String KEY_ENABLED = "enabled";
    public static final String KEY_CAMERA = "camera"; // "front" | "back"
    public static final String KEY_SENSITIVITY = "sensitivity"; // "low" | "medium" | "high"
    public static final String KEY_COOLDOWN_MS = "cooldownMs";
    public static final String KEY_SHOW_FEEDBACK = "showFeedback";
    public static final String KEY_HAPTIC = "haptic";
    public static final String KEY_TEST_MODE = "testMode";

    // Default gesture -> action mapping (configurable, never hard-coded in logic).
    // Actions: wake_hud, zoom_in, zoom_out, swipe_prev, swipe_next,
    //          volume_up, volume_down, lock_hud, open_panel, none
    public static final Map<String, String> DEFAULT_ACTIONS = new HashMap<>();

    static {
        DEFAULT_ACTIONS.put("open_palm", "wake_hud");
        DEFAULT_ACTIONS.put("pinch_out", "zoom_in");
        DEFAULT_ACTIONS.put("pinch_in", "zoom_out");
        DEFAULT_ACTIONS.put("swipe_left", "swipe_prev");
        DEFAULT_ACTIONS.put("swipe_right", "swipe_next");
        DEFAULT_ACTIONS.put("thumb_up", "volume_up");
        DEFAULT_ACTIONS.put("thumb_down", "volume_down");
        DEFAULT_ACTIONS.put("fist", "lock_hud");
        DEFAULT_ACTIONS.put("two_finger_up", "open_panel");
        DEFAULT_ACTIONS.put("two_finger_left", "swipe_prev");
        DEFAULT_ACTIONS.put("two_finger_right", "swipe_next");
    }

    private final SharedPreferences prefs;

    public GestureSettingsStore(Context context) {
        prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public boolean isEnabled() {
        return prefs.getBoolean(KEY_ENABLED, false); // OFF by default
    }

    public void setEnabled(boolean enabled) {
        prefs.edit().putBoolean(KEY_ENABLED, enabled).apply();
    }

    /** "front" (default) or "back". */
    public String getCamera() {
        String camera = prefs.getString(KEY_CAMERA, "front");
        return "back".equals(camera) ? "back" : "front";
    }

    public void setCamera(String camera) {
        prefs.edit().putString(KEY_CAMERA, "back".equals(camera) ? "back" : "front").apply();
    }

    /** "low" | "medium" (default) | "high". */
    public String getSensitivity() {
        String sensitivity = prefs.getString(KEY_SENSITIVITY, "medium");
        if ("low".equals(sensitivity) || "high".equals(sensitivity)) return sensitivity;
        return "medium";
    }

    public void setSensitivity(String sensitivity) {
        if (!"low".equals(sensitivity) && !"high".equals(sensitivity)) sensitivity = "medium";
        prefs.edit().putString(KEY_SENSITIVITY, sensitivity).apply();
    }

    public long getCooldownMs() {
        long cooldownMs = prefs.getLong(KEY_COOLDOWN_MS, 1200L);
        return Math.max(400L, Math.min(5000L, cooldownMs));
    }

    public void setCooldownMs(long cooldownMs) {
        prefs.edit().putLong(KEY_COOLDOWN_MS, Math.max(400L, Math.min(5000L, cooldownMs))).apply();
    }

    public boolean isShowFeedback() {
        return prefs.getBoolean(KEY_SHOW_FEEDBACK, true);
    }

    public void setShowFeedback(boolean showFeedback) {
        prefs.edit().putBoolean(KEY_SHOW_FEEDBACK, showFeedback).apply();
    }

    public boolean isHaptic() {
        return prefs.getBoolean(KEY_HAPTIC, true);
    }

    public void setHaptic(boolean haptic) {
        prefs.edit().putBoolean(KEY_HAPTIC, haptic).apply();
    }

    public boolean isTestMode() {
        return prefs.getBoolean(KEY_TEST_MODE, false); // disabled by default
    }

    public void setTestMode(boolean testMode) {
        prefs.edit().putBoolean(KEY_TEST_MODE, testMode).apply();
    }

    /** Configured action for a gesture id, or "none". */
    public String getAction(String gestureId) {
        String fallback = DEFAULT_ACTIONS.get(gestureId);
        if (fallback == null) fallback = "none";
        return prefs.getString("action_" + gestureId, fallback);
    }

    public void setAction(String gestureId, String action) {
        if (gestureId == null || action == null) return;
        prefs.edit().putString("action_" + gestureId, action).apply();
    }

    public Map<String, String> getAllActions() {
        Map<String, String> actions = new HashMap<>();
        for (String gestureId : DEFAULT_ACTIONS.keySet()) {
            actions.put(gestureId, getAction(gestureId));
        }
        return actions;
    }

    /** Frames required to confirm a gesture (sensitivity mapping). */
    public int getConfirmFrames() {
        switch (getSensitivity()) {
            case "low": return 5;
            case "high": return 2;
            default: return 3;
        }
    }

    /** Minimum candidate confidence (sensitivity mapping). */
    public float getMinConfidence() {
        switch (getSensitivity()) {
            case "low": return 0.80f;
            case "high": return 0.55f;
            default: return 0.68f;
        }
    }
}
