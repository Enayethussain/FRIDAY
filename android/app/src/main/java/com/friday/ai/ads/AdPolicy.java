package com.friday.ai.ads;

/**
 * Pure App Open policy math (no Android/GMA dependencies) so the rules are
 * unit-testable on the JVM. AppOpenAdManager delegates to these methods;
 * behavior is identical to the previously inline logic.
 */
public final class AdPolicy {

    private AdPolicy() {}

    /** Freshness window for a loaded App Open ad. */
    public static final long AD_EXPIRY_MS = 4L * 60L * 60L * 1000L;
    /** Minimum gap between two displays. */
    public static final long SHOW_COOLDOWN_MS = 3L * 60L * 1000L;
    /** Base for exponential load-retry backoff. */
    public static final long RETRY_BASE_MS = 60L * 1000L;
    /** Cap for the backoff exponent (retries continue, resume-gated). */
    public static final int MAX_RETRY_SHIFT = 3;

    /** True when a load at {@code loadTimeMs} is still showable at {@code nowMs}. */
    public static boolean isFresh(long loadTimeMs, long nowMs) {
        if (loadTimeMs <= 0) return false;
        return nowMs - loadTimeMs < AD_EXPIRY_MS;
    }

    /** True when enough time passed since {@code lastShownMs} (0 = never shown). */
    public static boolean cooldownElapsed(long lastShownMs, long nowMs) {
        if (lastShownMs <= 0) return true;
        return nowMs - lastShownMs >= SHOW_COOLDOWN_MS;
    }

    /**
     * Backoff after {@code failures} consecutive load failures
     * (1 min, 2 min, 4 min, then capped at 8 min). Resume-gated, never a loop.
     */
    public static long backoffDelayMs(int failures) {
        int shift = Math.max(0, Math.min(failures - 1, MAX_RETRY_SHIFT));
        if (failures <= 0) return 0;
        return RETRY_BASE_MS * (1L << shift);
    }

    /** Full show gate: every condition App Open requires at resume. */
    public static boolean canShow(boolean consentDone, boolean adsAllowed,
            boolean showingAd, boolean criticalBusy, boolean adFresh,
            boolean cooldownOk, boolean hasActivity) {
        return consentDone && adsAllowed && !showingAd && !criticalBusy
                && adFresh && cooldownOk && hasActivity;
    }
}
