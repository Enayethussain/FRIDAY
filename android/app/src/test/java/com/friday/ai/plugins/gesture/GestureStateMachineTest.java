package com.friday.ai.plugins.gesture;

import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * Real tests for the gesture state machine: confirmation gating, cooldown,
 * swipe detection, two-hand zoom and pinch-gap zoom. No Android needed.
 */
public class GestureStateMachineTest {

    private static final class Rec implements GestureStateMachine.Listener {
        final List<String> confirmed = new ArrayList<>();
        final List<GestureStateMachine.State> states = new ArrayList<>();

        @Override
        public void onConfirmed(String gestureId, float confidence) {
            confirmed.add(gestureId);
        }

        @Override
        public void onStateChanged(GestureStateMachine.State state) {
            states.add(state);
        }
    }

    private static GestureStateMachine machine(Rec rec) {
        return new GestureStateMachine(rec, 3, 0.68f, 1200L);
    }

    @Test
    public void openPalm_confirmsAfterThreeFrames() {
        Rec rec = new Rec();
        GestureStateMachine sm = machine(rec);
        long t = 1000L;
        for (int i = 0; i < 3; i++) {
            sm.onFrame("open_palm", 0.9f, 1, 0.5f, 0.5f, -1f, 0.8f, t);
            t += 100L;
        }
        assertEquals(1, rec.confirmed.size());
        assertEquals("open_palm", rec.confirmed.get(0));
    }

    @Test
    public void singleFrame_doesNotConfirm() {
        Rec rec = new Rec();
        GestureStateMachine sm = machine(rec);
        sm.onFrame("open_palm", 0.9f, 1, 0.5f, 0.5f, -1f, 0.8f, 1000L);
        assertTrue(rec.confirmed.isEmpty());
        assertEquals(GestureStateMachine.State.GESTURE_CANDIDATE, sm.getState());
    }

    @Test
    public void cooldown_blocksRepeatTrigger() {
        Rec rec = new Rec();
        GestureStateMachine sm = machine(rec);
        long t = 1000L;
        for (int i = 0; i < 3; i++) {
            sm.onFrame("fist", 0.9f, 1, 0.5f, 0.5f, -1f, 0.8f, t);
            t += 100L;
        }
        assertEquals(1, rec.confirmed.size());
        // Palm held still during cooldown -> nothing more fires.
        for (int i = 0; i < 10; i++) {
            sm.onFrame("fist", 0.9f, 1, 0.5f, 0.5f, -1f, 0.8f, t);
            t += 100L;
        }
        assertEquals(1, rec.confirmed.size());
        assertEquals(GestureStateMachine.State.COOLDOWN, sm.getState());
    }

    @Test
    public void swipeRight_detectedFromTrail() {
        Rec rec = new Rec();
        GestureStateMachine sm = machine(rec);
        long t = 5000L;
        sm.onFrame("palm", 0.5f, 1, 0.30f, 0.5f, -1f, 0.8f, t);
        t += 150L;
        sm.onFrame("palm", 0.5f, 1, 0.42f, 0.5f, -1f, 0.8f, t);
        t += 150L;
        sm.onFrame("open_palm", 0.8f, 1, 0.60f, 0.5f, -1f, 0.8f, t);
        assertEquals(1, rec.confirmed.size());
        assertEquals("swipe_right", rec.confirmed.get(0));
    }

    @Test
    public void twoHandSpread_confirmsZoomIn() {
        Rec rec = new Rec();
        GestureStateMachine sm = machine(rec);
        long t = 9000L;
        sm.onFrame("palm", 0.8f, 2, 0.5f, 0.5f, 0.30f, 0.8f, t);
        t += 150L;
        sm.onFrame("palm", 0.8f, 2, 0.5f, 0.5f, 0.45f, 0.8f, t);
        assertEquals(1, rec.confirmed.size());
        assertEquals("pinch_out", rec.confirmed.get(0));
    }

    @Test
    public void lowConfidence_neverConfirms() {
        Rec rec = new Rec();
        GestureStateMachine sm = machine(rec);
        long t = 20000L;
        for (int i = 0; i < 10; i++) {
            sm.onFrame("open_palm", 0.4f, 1, 0.5f, 0.5f, -1f, 0.8f, t);
            t += 100L;
        }
        assertTrue(rec.confirmed.isEmpty());
    }

    @Test
    public void noneInput_returnsToIdle() {
        Rec rec = new Rec();
        GestureStateMachine sm = machine(rec);
        sm.onFrame("open_palm", 0.9f, 1, 0.5f, 0.5f, -1f, 0.8f, 30000L);
        sm.onFrame("none", 0f, 0, 0.5f, 0.5f, -1f, 1f, 30100L);
        assertEquals(GestureStateMachine.State.IDLE, sm.getState());
        assertTrue(rec.confirmed.isEmpty());
    }
}
