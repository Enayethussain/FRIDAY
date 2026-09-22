package com.friday.ai.plugins.gesture;

/**
 * GestureStateMachine — temporal smoothing + debounce + cooldown.
 *
 * IDLE -> HAND_DETECTED -> GESTURE_CANDIDATE -> GESTURE_CONFIRMED
 *      -> ACTION_EXECUTED -> COOLDOWN -> IDLE
 *
 * Pure logic, zero Android dependencies (unit-testable). The camera manager
 * feeds one classifier candidate per analyzed frame; this class decides when
 * a gesture is real enough to act on. Ambiguous input produces NOTHING.
 */
public final class GestureStateMachine {

    public enum State {
        IDLE,
        HAND_DETECTED,
        GESTURE_CANDIDATE,
        GESTURE_CONFIRMED,
        ACTION_EXECUTED,
        COOLDOWN
    }

    public interface Listener {
        /** A gesture survived confirmation — execute its mapped action now. */
        void onConfirmed(String gestureId, float confidence);

        void onStateChanged(State state);
    }

    // Swipe: fast sustained palm travel (normalized units).
    private static final float SWIPE_MIN_DISTANCE = 0.22f;
    private static final long SWIPE_MAX_MS = 700L;
    private static final float SWIPE_MIN_CONFIDENCE = 0.35f;
    // Two-hand pinch zoom: spread change threshold per confirm window.
    private static final float SPREAD_ZOOM_DELTA = 0.06f;

    private final Listener listener;
    private final int confirmFrames;
    private final float minConfidence;
    private final long cooldownMs;

    private State state = State.IDLE;
    private String pendingGesture;
    private int pendingCount;
    private long cooldownUntilMs;
    private long actionCooldownUntilMs;

    // Single-hand swipe trail.
    private float trailStartX;
    private float trailStartY;
    private long trailStartMs;
    private boolean trailActive;
    private long lastSwipeAtMs;

    // Two-hand spread trail.
    private float lastSpread = -1f;
    private long lastSpreadMs;

    // Single-hand pinch-gap trail: growing gap = spread fingers (zoom out
    // release) vs pinch forming. A completed pinch-hold followed by hand
    // opening outward = zoom IN; pinch tightening = zoom OUT.
    private float pinchTrailStartGap = -1f;
    private long pinchTrailStartMs;
    private static final float PINCH_GAP_DELTA = 0.14f;
    private static final long PINCH_TRAIL_MAX_MS = 900L;

    public GestureStateMachine(Listener listener, int confirmFrames, float minConfidence, long cooldownMs) {
        this.listener = listener;
        this.confirmFrames = Math.max(1, confirmFrames);
        this.minConfidence = minConfidence;
        this.cooldownMs = Math.max(400L, cooldownMs);
    }

    public State getState() {
        return state;
    }

    /** Milliseconds left in cooldown (0 when free). */
    public long getCooldownRemainingMs(long nowMs) {
        if (state != State.COOLDOWN && state != State.ACTION_EXECUTED) return 0L;
        return Math.max(0L, Math.max(cooldownUntilMs, actionCooldownUntilMs) - nowMs);
    }

    public void reset() {
        setState(State.IDLE);
        pendingGesture = null;
        pendingCount = 0;
        trailActive = false;
        lastSpread = -1f;
        pinchTrailStartGap = -1f;
    }

    /**
     * Feed one analyzed frame.
     *
     * @param candidateId  classifier gesture id ("open_palm", "pinch", "fist",
     *                     "thumb_up", "thumb_down", "two_finger", "palm", "none")
     * @param confidence   0..1
     * @param handCount    1 or 2
     * @param cx           palm centroid x (0..1)
     * @param cy           palm centroid y (0..1)
     * @param spread       two-hand palm distance (0..1), or -1 when not two hands
     * @param pinchGap     normalized thumb-index gap (for pinch in/out direction)
     * @param nowMs        frame timestamp
     */
    public void onFrame(String candidateId, float confidence, int handCount,
                        float cx, float cy, float spread, float pinchGap, long nowMs) {
        if (candidateId == null) candidateId = "none";

        // Cooldown gate: observe but never fire.
        if (nowMs < cooldownUntilMs || nowMs < actionCooldownUntilMs) {
            if (state != State.COOLDOWN) setState(State.COOLDOWN);
            updateTrails(cleanupId(candidateId), cx, cy, spread, nowMs);
            return;
        }
        if (state == State.COOLDOWN) {
            setState(State.IDLE);
            pendingGesture = null;
            pendingCount = 0;
        }

        // Two-hand zoom has priority when two solid hands are visible.
        if (handCount >= 2 && spread > 0) {
            String zoom = checkTwoHandZoom(spread, nowMs);
            if (zoom != null) {
                confirm(zoom, Math.max(confidence, 0.8f), nowMs);
                return;
            }
        }

        // Single-hand pinch directional zoom from thumb-index gap trail.
        if (handCount == 1) {
            String pinchZoom = checkPinchZoom(candidateId, pinchGap, nowMs);
            if (pinchZoom != null) {
                confirm(pinchZoom, Math.max(confidence, 0.75f), nowMs);
                return;
            }
        }

        // Swipe has priority for fast directional palm travel.
        String swipe = checkSwipe(candidateId, confidence, handCount, cx, cy, nowMs);
        if (swipe != null) {
            confirm(swipe, Math.max(confidence, 0.75f), nowMs);
            return;
        }

        updateTrails(cleanupId(candidateId), cx, cy, spread, nowMs);

        if ("none".equals(candidateId) || handCount == 0) {
            if (state != State.IDLE) {
                pendingGesture = null;
                pendingCount = 0;
                setState(handCount > 0 ? State.HAND_DETECTED : State.IDLE);
            }
            return;
        }

        if (state == State.IDLE) setState(State.HAND_DETECTED);

        String mapped = mapCandidate(candidateId, handCount);
        if (mapped == null) {
            // Tracked but not actionable (generic palm) — stay detected, fire nothing.
            pendingGesture = null;
            pendingCount = 0;
            return;
        }

        if (!mapped.equals(pendingGesture)) {
            pendingGesture = mapped;
            pendingCount = 1;
            setState(State.GESTURE_CANDIDATE);
            return;
        }

        pendingCount++;
        if (confidence >= minConfidence && pendingCount >= confirmFrames) {
            confirm(mapped, confidence, nowMs);
        }
    }

    /** Called by the plugin after the mapped action finished (success or fail). */
    public void onActionFinished(long nowMs) {
        actionCooldownUntilMs = nowMs + cooldownMs;
        cooldownUntilMs = actionCooldownUntilMs;
        pendingGesture = null;
        pendingCount = 0;
        trailActive = false;
        lastSpread = -1f;
        pinchTrailStartGap = -1f;
        setState(State.COOLDOWN);
    }

    private void confirm(String gestureId, float confidence, long nowMs) {
        setState(State.GESTURE_CONFIRMED);
        try {
            listener.onConfirmed(gestureId, confidence);
        } finally {
            setState(State.ACTION_EXECUTED);
            // Cooldown starts at dispatch; extended by onActionFinished.
            cooldownUntilMs = nowMs + cooldownMs;
            pendingGesture = null;
            pendingCount = 0;
            trailActive = false;
            lastSpread = -1f;
            pinchTrailStartGap = -1f;
        }
    }

    private void setState(State next) {
        if (state == next) return;
        state = next;
        try {
            listener.onStateChanged(next);
        } catch (Exception ignored) {
        }
    }

    /** Classifier ids -> stable gesture ids (pinch direction via gap trail). */
    private String mapCandidate(String candidateId, int handCount) {
        switch (candidateId) {
            case "open_palm": return "open_palm";
            case "fist": return "fist";
            case "thumb_up": return "thumb_up";
            case "thumb_down": return "thumb_down";
            case "two_finger": return "two_finger_up";
            default: return null;
        }
    }

    /**
     * Single-hand pinch zoom: while a pinch is held, the thumb-index gap
     * widening = fingers spreading outward = ZOOM IN; tightening = ZOOM OUT.
     */
    private String checkPinchZoom(String candidateId, float pinchGap, long nowMs) {
        if (!"pinch".equals(candidateId)) {
            if (nowMs - pinchTrailStartMs > PINCH_TRAIL_MAX_MS) pinchTrailStartGap = -1f;
            return null;
        }
        if (pinchTrailStartGap < 0) {
            pinchTrailStartGap = pinchGap;
            pinchTrailStartMs = nowMs;
            return null;
        }
        if (nowMs - pinchTrailStartMs > PINCH_TRAIL_MAX_MS) {
            pinchTrailStartGap = pinchGap;
            pinchTrailStartMs = nowMs;
            return null;
        }
        float delta = pinchGap - pinchTrailStartGap;
        if (Math.abs(delta) < PINCH_GAP_DELTA) return null;
        pinchTrailStartGap = -1f;
        return delta > 0 ? "pinch_out" : "pinch_in";
    }

    private String cleanupId(String candidateId) {
        return candidateId;
    }

    private void updateTrails(String candidateId, float cx, float cy, float spread, long nowMs) {
        boolean trackable = "palm".equals(candidateId) || "open_palm".equals(candidateId)
                || "two_finger".equals(candidateId) || "pinch".equals(candidateId);
        if (!trackable) {
            if (nowMs - trailStartMs > SWIPE_MAX_MS) trailActive = false;
            return;
        }
        if (!trailActive) {
            trailActive = true;
            trailStartX = cx;
            trailStartY = cy;
            trailStartMs = nowMs;
        } else if (nowMs - trailStartMs > SWIPE_MAX_MS) {
            // Sliding window: restart so old positions can't fake a swipe.
            trailStartX = cx;
            trailStartY = cy;
            trailStartMs = nowMs;
        }
        if (spread > 0) {
            lastSpread = spread;
            lastSpreadMs = nowMs;
        }
    }

    private String checkSwipe(String candidateId, float confidence, int handCount,
                              float cx, float cy, long nowMs) {
        if (handCount != 1) return null;
        boolean swipable = "palm".equals(candidateId) || "open_palm".equals(candidateId)
                || "two_finger".equals(candidateId);
        if (!swipable || confidence < SWIPE_MIN_CONFIDENCE) return null;
        if (!trailActive) return null;
        long dt = nowMs - trailStartMs;
        if (dt <= 0 || dt > SWIPE_MAX_MS) return null;
        if (nowMs - lastSwipeAtMs < cooldownMs) return null;
        float dx = cx - trailStartX;
        float dy = cy - trailStartY;
        float adx = Math.abs(dx);
        float ady = Math.abs(dy);
        if (Math.max(adx, ady) < SWIPE_MIN_DISTANCE) return null;
        // Dominant axis only — diagonals are ambiguous, fire nothing.
        if (adx > ady * 1.4f) {
            lastSwipeAtMs = nowMs;
            trailActive = false;
            if ("two_finger".equals(candidateId)) {
                return dx < 0 ? "two_finger_left" : "two_finger_right";
            }
            return dx < 0 ? "swipe_left" : "swipe_right";
        }
        if (ady > adx * 1.6f && dy < 0) {
            // Upward flick only (down-flicks collide with natural hand drops).
            if ("two_finger".equals(candidateId)) {
                lastSwipeAtMs = nowMs;
                trailActive = false;
                return "two_finger_up";
            }
        }
        return null;
    }

    private String checkTwoHandZoom(float spread, long nowMs) {
        if (lastSpread <= 0) return null;
        if (nowMs - lastSpreadMs > SWIPE_MAX_MS) return null;
        float delta = spread - lastSpread;
        if (Math.abs(delta) < SPREAD_ZOOM_DELTA) return null;
        lastSpread = spread;
        lastSpreadMs = nowMs;
        return delta > 0 ? "pinch_out" : "pinch_in";
    }
}
