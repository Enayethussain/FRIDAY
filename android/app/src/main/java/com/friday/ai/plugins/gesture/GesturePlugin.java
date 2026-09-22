package com.friday.ai.plugins.gesture;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.Settings;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * GesturePlugin ("GestureControl") — real on-device hand-gesture control.
 *
 * Pipeline (all on-device, zero uploads):
 *  CameraX (640x480, ~15 FPS) -> MediaPipe HandLandmarker (bundled .task)
 *  -> GestureClassifier (landmark math) -> GestureStateMachine
 *  (IDLE->HAND_DETECTED->CANDIDATE->CONFIRMED->EXECUTED->COOLDOWN->IDLE)
 *  -> GestureActionExecutor (native, verified) or WebView HUD (reported back).
 *
 * Privacy: camera runs ONLY while gesture mode is started AND the app is
 * foregrounded. onPause() always stops capture. App closed = stopped.
 * No frames recorded, stored, uploaded or logged — only normalized
 * landmark coordinates exist in RAM (plus test-mode overlay points).
 */
@CapacitorPlugin(name = "GestureControl")
public class GesturePlugin extends Plugin
        implements GestureCameraManager.Callback, GestureStateMachine.Listener {

    private static final int REQ_CAMERA = 0x6E57; // "nW"
    private static final String PREF_DENIED_BEFORE = "camera_denied_before";
    private static final long HUD_RESULT_TIMEOUT_MS = 5000L;

    private GestureSettingsStore settings;
    private GestureCameraManager camera;
    private GestureStateMachine machine;
    private GestureActionExecutor executor;

    private boolean useFrontCamera = true;
    private volatile GestureStateMachine.State currentState =
            GestureStateMachine.State.IDLE;
    private volatile boolean handPresent;
    private volatile float lastFps = -1f;
    private volatile String lastGesture = "";
    private volatile float lastConfidence;
    private volatile String lastActionResult = "";
    private volatile boolean lastActionOk;
    private volatile List<float[]> lastLandmarks; // test-mode overlay only

    private final Map<String, PendingHud> pendingHud = new ConcurrentHashMap<>();
    private PluginCall pendingPermissionCall;

    private static final class PendingHud {
        final String gestureId;
        final float confidence;
        final long dispatchedAt;

        PendingHud(String gestureId, float confidence, long dispatchedAt) {
            this.gestureId = gestureId;
            this.confidence = confidence;
            this.dispatchedAt = dispatchedAt;
        }
    }

    // ---------------- Capacitor lifecycle ----------------

    @Override
    public void load() {
        Context ctx = getContext();
        settings = new GestureSettingsStore(ctx);
        executor = new GestureActionExecutor(ctx);
        useFrontCamera = !"back".equals(settings.getCamera());
        machine = newMachine();
    }

    @Override
    protected void handleOnPause() {
        // Spec section 9: background = STOP. Never keep the camera alive.
        if (camera != null && camera.isRunning()) {
            stopInternal();
            emitStatus("PAUSED_BACKGROUND",
                    "App background me hai — gesture camera band.");
        }
    }

    @Override
    protected void handleOnResume() {
        // Stay stopped; the HUD offers an explicit resume tap (no secret restart).
        emitStatus(null, null);
    }

    @Override
    protected void handleRequestPermissionsResult(int requestCode,
                                                  String[] permissions,
                                                  int[] grantResults) {
        if (requestCode != REQ_CAMERA) return;
        boolean granted = grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (granted) {
            PluginCall call = pendingPermissionCall;
            pendingPermissionCall = null;
            if (call != null) startInternal(call);
        } else {
            markDeniedBefore();
            PluginCall call = pendingPermissionCall;
            pendingPermissionCall = null;
            if (call != null) {
                call.reject("Sir, camera permission is required for gesture control.",
                        "CAMERA_PERMISSION_DENIED");
            }
            emitStatus("PERMISSION_DENIED",
                    "Sir, camera permission is required for gesture control.");
        }
    }

    // ---------------- Plugin API ----------------

    @PluginMethod
    public void start(PluginCall call) {
        if (!settings.isEnabled()) {
            call.reject("Gesture control OFF hai. Pehle settings me ON karo.",
                    "GESTURE_DISABLED");
            return;
        }
        if (camera != null && camera.isRunning()) {
            JSObject ok = new JSObject();
            ok.put("started", true);
            ok.put("alreadyRunning", true);
            call.resolve(ok);
            return;
        }
        int perm = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.CAMERA);
        if (perm != PackageManager.PERMISSION_GRANTED) {
            if (isPermanentlyDenied()) {
                call.reject("Sir, camera permission is required for gesture control. "
                                + "Settings kholkar permission do.",
                        "CAMERA_PERMISSION_PERMANENTLY_DENIED");
                return;
            }
            pendingPermissionCall = call;
            try {
                Activity activity = getActivity();
                ActivityCompat.requestPermissions(activity,
                        new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
            } catch (Exception e) {
                pendingPermissionCall = null;
                call.reject("Camera permission request nahi ho paya: " + e.getMessage(),
                        "PERMISSION_REQUEST_FAILED");
            }
            return; // result handled in handleRequestPermissionsResult
        }
        startInternal(call);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopInternal();
        JSObject ok = new JSObject();
        ok.put("stopped", true);
        call.resolve(ok);
    }

    @PluginMethod
    public void getSettings(PluginCall call) {
        call.resolve(settingsJson());
    }

    @PluginMethod
    public void updateSettings(PluginCall call) {
        if (call.hasOption("enabled")) settings.setEnabled(call.getBoolean("enabled", false));
        if (call.hasOption("camera")) settings.setCamera(call.getString("camera", "front"));
        if (call.hasOption("sensitivity")) settings.setSensitivity(call.getString("sensitivity", "medium"));
        if (call.hasOption("cooldownMs")) {
            settings.setCooldownMs(call.getLong("cooldownMs", 1200L));
        }
        if (call.hasOption("showFeedback")) settings.setShowFeedback(call.getBoolean("showFeedback", true));
        if (call.hasOption("haptic")) settings.setHaptic(call.getBoolean("haptic", true));
        if (call.hasOption("testMode")) settings.setTestMode(call.getBoolean("testMode", false));
        useFrontCamera = !"back".equals(settings.getCamera());
        machine = newMachine(); // rebuild thresholds
        call.resolve(settingsJson());
    }

    @PluginMethod
    public void setAction(PluginCall call) {
        String gesture = call.getString("gesture");
        String action = call.getString("action");
        if (gesture == null || action == null) {
            call.reject("gesture + action required", "BAD_ARGS");
            return;
        }
        if (!GestureSettingsStore.DEFAULT_ACTIONS.containsKey(gesture)) {
            call.reject("Unknown gesture: " + gesture, "UNKNOWN_GESTURE");
            return;
        }
        settings.setAction(gesture, action);
        JSObject ok = new JSObject();
        ok.put("gesture", gesture);
        ok.put("action", action);
        call.resolve(ok);
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject status = statusJson(null, null);
        call.resolve(status);
    }

    /**
     * Called by the WebView HUD after it executed (or failed) a HUD-side
     * action. This is what makes success reporting honest.
     */
    @PluginMethod
    public void reportHudResult(PluginCall call) {
        String eventId = call.getString("eventId");
        Boolean ok = call.getBoolean("success", null);
        String message = call.getString("message", "");
        if (eventId == null || ok == null) {
            call.reject("eventId + success required", "BAD_ARGS");
            return;
        }
        PendingHud pending = pendingHud.remove(eventId);
        if (pending == null) {
            call.reject("Unknown or expired eventId", "UNKNOWN_EVENT");
            return;
        }
        finishAction(pending, ok, message == null ? "" : message);
        JSObject res = new JSObject();
        res.put("recorded", true);
        call.resolve(res);
    }

    /** Open this app's system settings (real intent for permission recovery). */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Context ctx = getContext();
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + ctx.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(intent);
            JSObject ok = new JSObject();
            ok.put("opened", true);
            call.resolve(ok);
        } catch (Exception e) {
            call.reject("Settings khol nahi paya: " + e.getMessage(), "SETTINGS_FAILED");
        }
    }

    /** Persist a calibration verdict (set only from a REAL camera detection). */
    @PluginMethod
    public void setCalibrated(PluginCall call) {
        String gesture = call.getString("gesture");
        Boolean detected = call.getBoolean("detected", null);
        if (gesture == null || detected == null) {
            call.reject("gesture + detected required", "BAD_ARGS");
            return;
        }
        getContext().getSharedPreferences(GestureSettingsStore.PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean("calibrated_" + gesture, detected)
                .apply();
        JSObject ok = new JSObject();
        ok.put("gesture", gesture);
        ok.put("detected", detected);
        call.resolve(ok);
    }

    // ---------------- internals ----------------

    private void startInternal(PluginCall call) {
        try {
            Activity activity = getActivity();
            if (!(activity instanceof androidx.lifecycle.LifecycleOwner)) {
                call.reject("Gesture camera ke liye activity lifecycle chahiye.",
                        "NO_LIFECYCLE");
                return;
            }
            machine = newMachine();
            camera = new GestureCameraManager(getContext(), this);
            camera.start((androidx.lifecycle.LifecycleOwner) activity, useFrontCamera);
            JSObject ok = new JSObject();
            ok.put("started", true);
            ok.put("camera", useFrontCamera ? "front" : "back");
            call.resolve(ok);
            emitStatus("STARTED", "Gesture camera live. Haath dikhao.");
        } catch (Exception e) {
            call.reject("Camera start nahi hui: " + e.getMessage(), "START_FAILED");
        }
    }

    private void stopInternal() {
        try {
            if (camera != null) camera.stop();
        } catch (Exception ignored) {
        }
        camera = null;
        if (machine != null) machine.reset();
        currentState = GestureStateMachine.State.IDLE;
        handPresent = false;
        lastLandmarks = null;
    }

    private GestureStateMachine newMachine() {
        return new GestureStateMachine(this,
                settings.getConfirmFrames(),
                settings.getMinConfidence(),
                settings.getCooldownMs());
    }

    private boolean isPermanentlyDenied() {
        SharedPreferences prefs = getContext()
                .getSharedPreferences(GestureSettingsStore.PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean(PREF_DENIED_BEFORE, false)) return false;
        try {
            return !ActivityCompat.shouldShowRequestPermissionRationale(
                    getActivity(), Manifest.permission.CAMERA);
        } catch (Exception e) {
            return true;
        }
    }

    private void markDeniedBefore() {
        getContext().getSharedPreferences(GestureSettingsStore.PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(PREF_DENIED_BEFORE, true)
                .apply();
    }

    // ---------------- camera frames ----------------

    @Override
    public void onHands(List<List<float[]>> hands, long timestampMs, float fps) {
        if (fps > 0) lastFps = fps;
        handPresent = hands != null && !hands.isEmpty();
        if (settings.isTestMode() && handPresent && hands.get(0) != null) {
            lastLandmarks = hands.get(0);
        } else if (!settings.isTestMode()) {
            lastLandmarks = null;
        }

        String candidateId = "none";
        float confidence = 0f;
        float cx = 0.5f;
        float cy = 0.5f;
        float spread = -1f;
        float pinchGap = 1f;
        int handCount = hands == null ? 0 : hands.size();

        if (handCount == 1) {
            GestureClassifier.Candidate c = classifyOne(hands.get(0), true);
            candidateId = idOf(c.gesture);
            confidence = c.confidence;
            cx = c.cx;
            cy = c.cy;
            pinchGap = c.pinchGap;
        } else if (handCount >= 2) {
            // Zoom uses both centroids; shape comes from the dominant hand.
            float[] c0 = centroid(hands.get(0));
            float[] c1 = centroid(hands.get(1));
            spread = (float) Math.hypot(c0[0] - c1[0], c0[1] - c1[1]);
            GestureClassifier.Candidate c = classifyOne(hands.get(0), false);
            candidateId = idOf(c.gesture);
            confidence = Math.max(c.confidence, 0.5f);
            cx = (c0[0] + c1[0]) / 2f;
            cy = (c0[1] + c1[1]) / 2f;
        }

        try {
            machine.onFrame(candidateId, confidence, handCount, cx, cy, spread, pinchGap, timestampMs);
        } catch (Exception e) {
            // A classifier bug must never kill the camera loop.
            emitStatus("CLASSIFY_ERROR", "Gesture classify me error — camera chal rahi hai.");
        }
        if (settings.isTestMode()) emitStatus(null, null);
    }

    private GestureClassifier.Candidate classifyOne(List<float[]> raw, boolean mirror) {
        List<GestureClassifier.Point> pts = new java.util.ArrayList<>(raw.size());
        for (float[] p : raw) {
            float x = p[0];
            if (mirror) x = GestureCameraManager.mirrorX(x, useFrontCamera);
            pts.add(new GestureClassifier.Point(x, p[1]));
        }
        GestureClassifier.Candidate c = GestureClassifier.classify(pts);
        if (mirror && useFrontCamera) {
            float mirroredCx = GestureCameraManager.mirrorX(c.cx, true);
            return new GestureClassifier.Candidate(c.gesture, c.confidence,
                    c.openness, c.pinchGap, mirroredCx, c.cy);
        }
        return c;
    }

    private float[] centroid(List<float[]> raw) {
        float sx = 0f;
        float sy = 0f;
        for (float[] p : raw) {
            sx += p[0];
            sy += p[1];
        }
        int n = Math.max(1, raw.size());
        float cx = sx / n;
        float cy = sy / n;
        if (useFrontCamera) cx = GestureCameraManager.mirrorX(cx, true);
        return new float[]{cx, cy};
    }

    private String idOf(GestureClassifier.Gesture gesture) {
        switch (gesture) {
            case OPEN_PALM: return "open_palm";
            case FIST: return "fist";
            case PINCH: return "pinch";
            case THUMB_UP: return "thumb_up";
            case THUMB_DOWN: return "thumb_down";
            case TWO_FINGER: return "two_finger";
            case PALM: return "palm";
            default: return "none";
        }
    }

    @Override
    public void onError(String code, String message) {
        emitStatus(code, message);
    }

    // ---------------- confirmed gestures ----------------

    @Override
    public void onConfirmed(String gestureId, float confidence) {
        lastGesture = gestureId;
        lastConfidence = confidence;
        String action = settings.getAction(gestureId);
        if (action == null || "none".equals(action)) {
            // Mapped to nothing — honest no-op, still cools down.
            lastActionOk = true;
            lastActionResult = gestureId + " detected (koi action mapped nahi).";
            machine.onActionFinished(System.currentTimeMillis());
            emitGestureEvent(null, gestureId, confidence, "none", true, lastActionResult, false);
            return;
        }
        if (GestureActionExecutor.kindOf(action) == GestureActionExecutor.Kind.NATIVE) {
            GestureActionExecutor.ActionResult r = executor.executeNative(action);
            lastActionOk = r.success;
            lastActionResult = r.message;
            executor.tick(settings.isHaptic() && r.success);
            machine.onActionFinished(System.currentTimeMillis());
            emitGestureEvent(null, gestureId, confidence, action, r.success, r.message, false);
            return;
        }
        // HUD-side action: honest two-step — web MUST report the real result.
        if ("lock_device".equals(action) && !executor.isDeviceLockAvailable()) {
            lastActionOk = false;
            lastActionResult = "Sir, Android doesn't allow this action with the current "
                    + "permission. Device-admin lock ON karo ya fist ko lock_hud par rakho.";
            machine.onActionFinished(System.currentTimeMillis());
            emitGestureEvent(null, gestureId, confidence, action, false, lastActionResult, false);
            return;
        }
        String eventId = UUID.randomUUID().toString();
        pendingHud.put(eventId,
                new PendingHud(gestureId, confidence, System.currentTimeMillis()));
        executor.tick(settings.isHaptic());
        emitGestureEvent(eventId, gestureId, confidence, action, false,
                "HUD action dispatched: " + action, true);
        // Watchdog: HUD must answer, else honest TIMEOUT (never fake success).
        final String eid = eventId;
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
            PendingHud pending = pendingHud.remove(eid);
            if (pending != null) {
                finishAction(pending, false,
                        "HUD se jawab nahi mila (timeout). Action confirm nahi hua.");
            }
        }, HUD_RESULT_TIMEOUT_MS);
    }

    private void finishAction(PendingHud pending, boolean ok, String message) {
        lastActionOk = ok;
        lastActionResult = message;
        try {
            machine.onActionFinished(System.currentTimeMillis());
        } catch (Exception ignored) {
        }
        emitGestureEvent(null, pending.gestureId, pending.confidence,
                settings.getAction(pending.gestureId), ok, message, false);
    }

    @Override
    public void onStateChanged(GestureStateMachine.State state) {
        currentState = state;
        if (settings.isTestMode()) emitStatus(null, null);
    }

    // ---------------- events to WebView ----------------

    private void emitGestureEvent(String eventId, String gesture, float confidence,
                                  String action, boolean success, String message,
                                  boolean needsHudAction) {
        if (!settings.isShowFeedback() && !needsHudAction && !settings.isTestMode()) {
            // Still notify the HUD silently so actions work; UI decides display.
        }
        JSObject data = new JSObject();
        if (eventId != null) data.put("eventId", eventId);
        data.put("gesture", gesture);
        data.put("confidence", Math.round(confidence * 100.0) / 100.0);
        data.put("action", action);
        data.put("success", success);
        data.put("message", message);
        data.put("needsHudAction", needsHudAction);
        notifyListeners("gestureEvent", data);
        emitStatus(null, null);
    }

    private void emitStatus(String code, String message) {
        JSObject status = statusJson(code, message);
        notifyListeners("gestureStatus", status);
    }

    private JSObject statusJson(String code, String message) {
        JSObject status = new JSObject();
        status.put("running", camera != null && camera.isRunning());
        status.put("enabled", settings.isEnabled());
        status.put("state", currentState.name());
        status.put("handPresent", handPresent);
        status.put("fps", lastFps < 0 ? 0 : Math.round(lastFps * 10.0) / 10.0);
        status.put("lastGesture", lastGesture);
        status.put("lastConfidence", Math.round(lastConfidence * 100.0) / 100.0);
        status.put("cooldownRemainingMs", machine == null ? 0
                : machine.getCooldownRemainingMs(System.currentTimeMillis()));
        status.put("lastActionOk", lastActionOk);
        status.put("lastActionResult", lastActionResult);
        status.put("testMode", settings.isTestMode());
        if (code != null) status.put("code", code);
        if (message != null) status.put("message", message);
        if (settings.isTestMode() && lastLandmarks != null) {
            JSArray landmarks = new JSArray();
            for (float[] p : lastLandmarks) {
                try {
                    JSONArray pair = new JSONArray();
                    pair.put(Math.round(p[0] * 1000.0) / 1000.0);
                    pair.put(Math.round(p[1] * 1000.0) / 1000.0);
                    landmarks.put(pair);
                } catch (Exception ignored) {
                }
            }
            status.put("landmarks", landmarks);
            status.put("landmarkCount", lastLandmarks.size());
        }
        return status;
    }

    private JSObject settingsJson() {
        JSObject json = new JSObject();
        json.put("enabled", settings.isEnabled());
        json.put("camera", settings.getCamera());
        json.put("sensitivity", settings.getSensitivity());
        json.put("cooldownMs", settings.getCooldownMs());
        json.put("showFeedback", settings.isShowFeedback());
        json.put("haptic", settings.isHaptic());
        json.put("testMode", settings.isTestMode());
        JSObject actions = new JSObject();
        for (Map.Entry<String, String> entry : settings.getAllActions().entrySet()) {
            actions.put(entry.getKey(), entry.getValue());
        }
        // Calibration verdicts (only ever set from real detections).
        JSObject calibrated = new JSObject();
        SharedPreferences prefs = getContext()
                .getSharedPreferences(GestureSettingsStore.PREFS, Context.MODE_PRIVATE);
        for (String gesture : GestureSettingsStore.DEFAULT_ACTIONS.keySet()) {
            calibrated.put(gesture, prefs.getBoolean("calibrated_" + gesture, false));
        }
        json.put("actions", actions);
        json.put("calibrated", calibrated);
        JSArray availableGestures = new JSArray();
        for (String gesture : GestureSettingsStore.DEFAULT_ACTIONS.keySet()) {
            availableGestures.put(gesture);
        }
        json.put("availableGestures", availableGestures);
        return json;
    }
}
