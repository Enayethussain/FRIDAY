package com.friday.ai.ads;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * Real unit tests for App Open policy math: freshness, cooldown, backoff and
 * the show gate. Pure JVM (no SDK, no device).
 */
public class AdPolicyTest {

    @Test
    public void freshAdIsShowable() {
        long now = 20_000_000_000L; // realistic epoch ms (synthetic small values trip the <=0 guard)
        assertTrue(AdPolicy.isFresh(now - 1000, now));
        assertTrue(AdPolicy.isFresh(now - AdPolicy.AD_EXPIRY_MS + 1000, now));
    }

    @Test
    public void staleAdIsRejected() {
        long now = 20_000_000_000L;
        assertFalse(AdPolicy.isFresh(0, now));
        assertFalse(AdPolicy.isFresh(-5, now));
        assertFalse(AdPolicy.isFresh(now - AdPolicy.AD_EXPIRY_MS, now));
        assertFalse(AdPolicy.isFresh(now - AdPolicy.AD_EXPIRY_MS - 1, now));
    }

    @Test
    public void cooldownFirstShowAllowed() {
        assertTrue(AdPolicy.cooldownElapsed(0, 20_000_000_000L));
    }

    @Test
    public void cooldownBlocksRapidReshow() {
        long shown = 20_000_000_000L;
        assertFalse(AdPolicy.cooldownElapsed(shown, shown + 1000));
        assertFalse(AdPolicy.cooldownElapsed(shown, shown + AdPolicy.SHOW_COOLDOWN_MS - 1));
        assertTrue(AdPolicy.cooldownElapsed(shown, shown + AdPolicy.SHOW_COOLDOWN_MS));
    }

    @Test
    public void backoffGrowsThenCaps() {
        assertEquals(0, AdPolicy.backoffDelayMs(0));
        assertEquals(60_000L, AdPolicy.backoffDelayMs(1));
        assertEquals(120_000L, AdPolicy.backoffDelayMs(2));
        assertEquals(240_000L, AdPolicy.backoffDelayMs(3));
        assertEquals(480_000L, AdPolicy.backoffDelayMs(4));
        assertEquals(480_000L, AdPolicy.backoffDelayMs(100));
    }

    @Test
    public void showGateRequiresEverything() {
        // All green.
        assertTrue(AdPolicy.canShow(true, true, false, false, true, true, true));
        // Each single veto blocks.
        assertFalse(AdPolicy.canShow(false, true, false, false, true, true, true)); // consent
        assertFalse(AdPolicy.canShow(true, false, false, false, true, true, true)); // entitlement
        assertFalse(AdPolicy.canShow(true, true, true, false, true, true, true)); // duplicate
        assertFalse(AdPolicy.canShow(true, true, false, true, true, true, true)); // critical op
        assertFalse(AdPolicy.canShow(true, true, false, false, false, true, true)); // stale
        assertFalse(AdPolicy.canShow(true, true, false, false, true, false, true)); // cooldown
        assertFalse(AdPolicy.canShow(true, true, false, false, true, true, false)); // no activity
    }
}
