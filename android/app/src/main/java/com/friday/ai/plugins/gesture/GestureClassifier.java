package com.friday.ai.plugins.gesture;

import java.util.List;

/**
 * GestureClassifier — pure landmark math, zero Android dependencies (unit-testable).
 *
 * Input: normalized MediaPipe hand landmarks (21 points, x/y in 0..1).
 * Output: a single candidate gesture + confidence, or NONE.
 *
 * NEVER guesses: ambiguous poses return NONE so the state machine stays IDLE.
 * Two-hand pinch-zoom (spread delta) is computed by the state machine from
 * two palm centroids; this class classifies single-hand shape only.
 */
public final class GestureClassifier {

    // MediaPipe hand landmark indices.
    private static final int WRIST = 0;
    private static final int THUMB_TIP = 4;
    private static final int THUMB_IP = 3;
    private static final int THUMB_MCP = 2;
    private static final int INDEX_TIP = 8;
    private static final int INDEX_PIP = 6;
    private static final int INDEX_MCP = 5;
    private static final int MIDDLE_TIP = 12;
    private static final int MIDDLE_PIP = 10;
    private static final int MIDDLE_MCP = 9;
    private static final int RING_TIP = 16;
    private static final int RING_PIP = 14;
    private static final int PINKY_TIP = 20;
    private static final int PINKY_PIP = 18;

    public enum Gesture {
        NONE,
        OPEN_PALM,
        FIST,
        PINCH,       // thumb+index close (direction resolved by state machine spread trail)
        THUMB_UP,
        THUMB_DOWN,
        TWO_FINGER,  // index+middle extended, ring+pinky folded (direction by trail)
        PALM         // generic tracked palm (for swipe trails) when shape is unclear but hand is solid
    }

    public static final class Point {
        public final float x;
        public final float y;

        public Point(float x, float y) {
            this.x = x;
            this.y = y;
        }
    }

    public static final class Candidate {
        public final Gesture gesture;
        /** 0..1 — caller applies the sensitivity threshold. */
        public final float confidence;
        /** 0..1 openness (0 = fist, 1 = fully open). */
        public final float openness;
        /** Normalized thumb-index gap (hand-size relative). */
        public final float pinchGap;
        /** Palm centroid (for swipe trails). */
        public final float cx;
        public final float cy;

        Candidate(Gesture gesture, float confidence, float openness, float pinchGap, float cx, float cy) {
            this.gesture = gesture;
            this.confidence = confidence;
            this.openness = openness;
            this.pinchGap = pinchGap;
            this.cx = cx;
            this.cy = cy;
        }
    }

    private GestureClassifier() {
    }

    public static Candidate classify(List<Point> pts) {
        if (pts == null || pts.size() < 21) {
            return new Candidate(Gesture.NONE, 0f, 0f, 1f, 0.5f, 0.5f);
        }
        for (Point p : pts) {
            if (p == null || Float.isNaN(p.x) || Float.isNaN(p.y)) {
                return new Candidate(Gesture.NONE, 0f, 0f, 1f, 0.5f, 0.5f);
            }
        }

        Point wrist = pts.get(WRIST);
        float handSize = Math.max(0.05f, dist(pts.get(WRIST), pts.get(MIDDLE_MCP)));

        boolean indexExt = extended(pts, INDEX_TIP, INDEX_PIP, WRIST);
        boolean middleExt = extended(pts, MIDDLE_TIP, MIDDLE_PIP, WRIST);
        boolean ringExt = extended(pts, RING_TIP, RING_PIP, WRIST);
        boolean pinkyExt = extended(pts, PINKY_TIP, PINKY_PIP, WRIST);
        boolean thumbExt = thumbExtended(pts, handSize);

        int extendedCount = (indexExt ? 1 : 0) + (middleExt ? 1 : 0) + (ringExt ? 1 : 0) + (pinkyExt ? 1 : 0);

        float openness = extendedCount / 4f;
        float pinchGap = dist(pts.get(THUMB_TIP), pts.get(INDEX_TIP)) / handSize;
        float cx = (pts.get(WRIST).x + pts.get(MIDDLE_MCP).x) / 2f;
        float cy = (pts.get(WRIST).y + pts.get(MIDDLE_MCP).y) / 2f;

        // Pinch wins over shape when thumb+index are truly close (but not when
        // the whole hand is a fist — tips coincide there too).
        if (pinchGap < 0.35f && (indexExt || middleExt)) {
            float confidence = clamp(1f - (pinchGap / 0.35f) * 0.4f, 0.6f, 0.95f);
            return new Candidate(Gesture.PINCH, confidence, openness, pinchGap, cx, cy);
        }

        // Thumb up / down: all other fingers folded + thumb tip clearly
        // above the knuckles (up) or below the wrist (down). Position-gated
        // so a relaxed fist thumb is never mistaken for a vote.
        if (!indexExt && !middleExt && !ringExt && !pinkyExt) {
            Point tip = pts.get(THUMB_TIP);
            Point ip = pts.get(THUMB_IP);
            float aboveKnuckles = pts.get(MIDDLE_MCP).y - tip.y;
            float belowIp = tip.y - ip.y;
            if (aboveKnuckles > handSize * 0.2f && (ip.y - tip.y) > handSize * 0.35f) {
                return new Candidate(Gesture.THUMB_UP, 0.88f, openness, pinchGap, cx, cy);
            }
            if (belowIp > handSize * 0.35f && tip.y > wrist.y - handSize * 0.1f) {
                return new Candidate(Gesture.THUMB_DOWN, 0.88f, openness, pinchGap, cx, cy);
            }
        }

        // Two fingers: index + middle extended, ring + pinky folded.
        if (indexExt && middleExt && !ringExt && !pinkyExt) {
            return new Candidate(Gesture.TWO_FINGER, 0.85f, openness, pinchGap, cx, cy);
        }

        // Open palm: all four fingers + thumb spread.
        if (extendedCount == 4 && thumbExt) {
            float spread = (dist(pts.get(INDEX_TIP), pts.get(PINKY_TIP)) / handSize);
            float confidence = spread > 1.1f ? 0.92f : 0.75f;
            return new Candidate(Gesture.OPEN_PALM, confidence, 1f, pinchGap, cx, cy);
        }

        // Fist: nothing extended, thumb folded across (not pointing up/down —
        // those returned above). The tip-to-wrist ratio rejects thumbs that
        // stick out sideways.
        if (extendedCount == 0) {
            float dt = dist(pts.get(THUMB_TIP), wrist);
            float dm = dist(pts.get(THUMB_MCP), wrist);
            if (dt < dm * 1.3f) {
                return new Candidate(Gesture.FIST, 0.9f, 0f, pinchGap, cx, cy);
            }
            return new Candidate(Gesture.NONE, 0f, openness, pinchGap, cx, cy);
        }

        // Solid hand but ambiguous shape — report PALM with LOW confidence so
        // swipe trails can still work but nothing fires without confirmation.
        if (extendedCount >= 2) {
            return new Candidate(Gesture.PALM, 0.45f, openness, pinchGap, cx, cy);
        }
        return new Candidate(Gesture.NONE, 0f, openness, pinchGap, cx, cy);
    }

    private static boolean extended(List<Point> pts, int tip, int pip, int wrist) {
        float dt = dist(pts.get(tip), pts.get(wrist));
        float dp = dist(pts.get(pip), pts.get(wrist));
        return dt > dp * 1.15f;
    }

    private static boolean thumbExtended(List<Point> pts, float handSize) {
        float dt = dist(pts.get(THUMB_TIP), pts.get(WRIST));
        float dm = dist(pts.get(THUMB_MCP), pts.get(WRIST));
        if (dt > dm * 1.15f) return true;
        // A thumb pointing straight up/down counts as extended even when the
        // tip stays near the wrist (real thumbs-down geometry).
        float dy = Math.abs(pts.get(THUMB_TIP).y - pts.get(THUMB_IP).y);
        return dy > handSize * 0.4f;
    }

    private static float dist(Point a, Point b) {
        float dx = a.x - b.x;
        float dy = a.y - b.y;
        return (float) Math.hypot(dx, dy);
    }

    private static float clamp(float v, float lo, float hi) {
        return Math.max(lo, Math.min(hi, v));
    }
}
