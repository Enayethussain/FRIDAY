package com.friday.ai.plugins;

import android.app.Activity;

import com.friday.ai.FridayApp;
import com.friday.ai.ads.AppOpenAdManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor bridge for FRIDAY App Open ads ("FridayAds").
 *
 * JS owns the entitlement decision (verified backend plan) and the
 * critical-operation flag; native owns SDK state, lifecycle, cooldown and
 * expiry. Methods never throw to JS — every call resolves honestly.
 */
@CapacitorPlugin(name = "FridayAds")
public class AdsPlugin extends Plugin {

    private AppOpenAdManager manager() {
        try {
            if (getContext() == null) return null;
            android.content.Context app = getContext().getApplicationContext();
            if (app instanceof FridayApp) return ((FridayApp) app).getAdsManager();
        } catch (Exception ignored) { /* fall through */ }
        return null;
    }

    private void pushState(AppOpenAdManager m) {
        try {
            JSObject ret = new JSObject();
            ret.put("state", m.getState().name());
            ret.put("isTestUnit", m.isTestUnit());
            ret.put("lastShownAt", m.getLastShownMs());
            notifyListeners("adState", ret);
        } catch (Exception ignored) { /* listener-only */ }
    }

    /** Push verified entitlement + critical-op state from JS. */
    @PluginMethod
    public void setConfig(PluginCall call) {
        AppOpenAdManager m = manager();
        if (m == null) {
            call.resolve(stateOnly("NOT_AVAILABLE"));
            return;
        }
        try {
            if (call.hasOption("adsAllowed")) m.setAdsAllowed(call.getBoolean("adsAllowed", false));
            if (call.hasOption("criticalBusy")) m.setCriticalBusy(call.getBoolean("criticalBusy", false));
            m.setStateListener((s, d) -> pushState(m));
            // Opportunistic preload now that eligibility may have changed.
            m.preload();
            JSObject ret = stateOnly(m.getState().name());
            ret.put("isTestUnit", m.isTestUnit());
            call.resolve(ret);
        } catch (Exception e) {
            call.resolve(stateOnly("NOT_AVAILABLE"));
        }
    }

    /** Explicit preload request (no-op unless eligible). */
    @PluginMethod
    public void preload(PluginCall call) {
        AppOpenAdManager m = manager();
        if (m == null) {
            call.resolve(stateOnly("NOT_AVAILABLE"));
            return;
        }
        try {
            m.setStateListener((s, d) -> pushState(m));
            m.preload();
            JSObject ret = stateOnly(m.getState().name());
            ret.put("isTestUnit", m.isTestUnit());
            call.resolve(ret);
        } catch (Exception e) {
            call.resolve(stateOnly("NOT_AVAILABLE"));
        }
    }

    /** Honest current state for diagnostics (never claims loaded/shown). */
    @PluginMethod
    public void getState(PluginCall call) {
        AppOpenAdManager m = manager();
        if (m == null) {
            call.resolve(stateOnly("NOT_INITIALIZED"));
            return;
        }
        JSObject ret = stateOnly(m.getState().name());
        ret.put("isTestUnit", m.isTestUnit());
        ret.put("lastShownAt", m.getLastShownMs());
        call.resolve(ret);
    }

    /**
     * Full on-device triage snapshot: real SDK error codes/messages,
     * entitlement, foreground, staleness. No keys, tokens, or personal data.
     */
    @PluginMethod
    public void getDiagnostics(PluginCall call) {
        AppOpenAdManager m = manager();
        JSObject ret = new JSObject();
        if (m == null) {
            ret.put("state", "NOT_AVAILABLE");
            call.resolve(ret);
            return;
        }
        ret.put("state", m.getState().name());
        ret.put("stateDetail", m.getStateDetail());
        ret.put("isTestUnit", m.isTestUnit());
        ret.put("lastShownAt", m.getLastShownMs());
        ret.put("lastLoadCode", m.getLastLoadCode());
        ret.put("lastLoadMessage", m.getLastLoadMessage());
        ret.put("lastShowCode", m.getLastShowCode());
        ret.put("lastShowMessage", m.getLastShowMessage());
        ret.put("adsAllowed", m.isAdsAllowed());
        ret.put("criticalBusy", m.isCriticalBusy());
        ret.put("consentDone", m.isConsentDone());
        ret.put("foreground", m.isForeground());
        ret.put("adFresh", m.isAdFreshNow());
        call.resolve(ret);
    }

    private JSObject stateOnly(String state) {
        JSObject ret = new JSObject();
        ret.put("state", state);
        return ret;
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        try {
            AppOpenAdManager m = manager();
            if (m == null) return;
            Activity a = getActivity();
            if (a != null) m.setCurrentActivity(a);
        } catch (Exception ignored) { /* never break resume */ }
    }
}
