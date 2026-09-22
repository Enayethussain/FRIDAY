package com.friday.ai.plugins.gesture;

import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * Real tests for GestureClassifier landmark math (no camera, no mocks of
 * detection — synthetic 21-point hands with known shapes).
 */
public class GestureClassifierTest {

    private static List<GestureClassifier.Point> hand(
            float thumbTipX, float thumbTipY,
            boolean index, boolean middle, boolean ring, boolean pinky) {
        List<GestureClassifier.Point> pts = new ArrayList<>();
        for (int i = 0; i < 21; i++) pts.add(new GestureClassifier.Point(0.5f, 0.7f));
        // Wrist + middle MCP define hand size/centroid.
        pts.set(0, new GestureClassifier.Point(0.5f, 0.9f));
        pts.set(9, new GestureClassifier.Point(0.5f, 0.6f));
        pts.set(2, new GestureClassifier.Point(0.42f, 0.75f)); // thumb MCP
        pts.set(3, new GestureClassifier.Point(0.38f, 0.68f)); // thumb IP
        pts.set(4, new GestureClassifier.Point(thumbTipX, thumbTipY)); // thumb tip
        finger(pts, 8, 6, 5, index, 0.38f);
        finger(pts, 12, 10, 9, middle, 0.50f);
        finger(pts, 16, 14, 13, ring, 0.60f);
        finger(pts, 20, 18, 17, pinky, 0.68f);
        return pts;
    }

    private static void finger(List<GestureClassifier.Point> pts, int tip, int pip, int mcp,
                               boolean extended, float x) {
        pts.set(mcp, new GestureClassifier.Point(x, 0.6f));
        pts.set(pip, new GestureClassifier.Point(x, 0.5f));
        if (extended) {
            pts.set(tip, new GestureClassifier.Point(x, 0.3f)); // far from wrist
        } else {
            pts.set(tip, new GestureClassifier.Point(x, 0.75f)); // folded near wrist
        }
    }

    @Test
    public void openPalm_detected() {
        GestureClassifier.Candidate c = GestureClassifier.classify(
                hand(0.25f, 0.55f, true, true, true, true));
        assertEquals(GestureClassifier.Gesture.OPEN_PALM, c.gesture);
        assertTrue(c.confidence >= 0.68f);
    }

    @Test
    public void fist_detected() {
        List<GestureClassifier.Point> pts = hand(0.48f, 0.82f, false, false, false, false);
        GestureClassifier.Candidate c = GestureClassifier.classify(pts);
        assertEquals(GestureClassifier.Gesture.FIST, c.gesture);
    }

    @Test
    public void thumbUp_detected() {
        List<GestureClassifier.Point> pts = hand(0.40f, 0.30f, false, false, false, false);
        GestureClassifier.Candidate c = GestureClassifier.classify(pts);
        assertEquals(GestureClassifier.Gesture.THUMB_UP, c.gesture);
    }

    @Test
    public void thumbDown_detected() {
        List<GestureClassifier.Point> pts = hand(0.44f, 0.95f, false, false, false, false);
        // Thumb tip below IP joint, others folded -> down.
        GestureClassifier.Candidate c = GestureClassifier.classify(pts);
        assertEquals(GestureClassifier.Gesture.THUMB_DOWN, c.gesture);
    }

    @Test
    public void twoFinger_detected() {
        GestureClassifier.Candidate c = GestureClassifier.classify(
                hand(0.48f, 0.82f, true, true, false, false));
        assertEquals(GestureClassifier.Gesture.TWO_FINGER, c.gesture);
    }

    @Test
    public void pinch_detected_whenThumbIndexClose() {
        List<GestureClassifier.Point> pts = hand(0.40f, 0.36f, true, false, false, false);
        // Move index tip next to thumb tip.
        pts.set(8, new GestureClassifier.Point(0.42f, 0.38f));
        GestureClassifier.Candidate c = GestureClassifier.classify(pts);
        assertEquals(GestureClassifier.Gesture.PINCH, c.gesture);
    }

    @Test
    public void shortInput_returnsNone() {
        List<GestureClassifier.Point> pts = new ArrayList<>();
        pts.add(new GestureClassifier.Point(0.5f, 0.5f));
        GestureClassifier.Candidate c = GestureClassifier.classify(pts);
        assertEquals(GestureClassifier.Gesture.NONE, c.gesture);
    }

    @Test
    public void nullInput_returnsNone() {
        GestureClassifier.Candidate c = GestureClassifier.classify(null);
        assertEquals(GestureClassifier.Gesture.NONE, c.gesture);
    }
}
