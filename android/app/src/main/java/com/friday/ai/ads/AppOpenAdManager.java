package com.friday.ai.ads;

import android.app.Activity;
import android.app.Application;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.lifecycle.DefaultLifecycleObserver;
import androidx.lifecycle.LifecycleOwner;
import androidx.lifecycle.ProcessLifecycleOwner;

import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.appopen.AppOpenAd;
import com.google.android.gms.ads.initialization.AdapterStatus;
import com.google.android.ump.ConsentForm;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

import java.util.Date;
import java.util.Map;

/**
 * Real App Open ads for FRIDAY (Google Mobile Ads SDK).
 *
 * <ul>
 *   <li>DEBUG builds always use Google's official TEST App Open unit, so
 *       development can never load/click production ads.</li>
 *   <li>Release builds use the production unit.</li>
 *   <li>Ads show only on app resume (cold start counts as a resume), only for
 *       FREE users ({@code adsAllowed}), never while a critical FRIDAY
 *       operation runs ({@code criticalBusy}), never twice in a row, with a
 *       cooldown and a 4-hour freshness expiry.</li>
 *   <li>Any failure degrades silently: FRIDAY keeps working, startup is never
 *       blocked, no fake ad content is ever shown.</li>
 *   <li>No FRIDAY data (conversations, files, biometrics, tokens) is sent to
 *       AdMob — only the standard {@link AdRequest}.</li>
 * </ul>
 */
public class AppOpenAdManager implements DefaultLifecycleObserver {

    private static final String TAG = "FridayAds";

    /** Google's official TEST App Open unit — debug builds only. */
    private static final String TEST_AD_UNIT_ID = "ca-app-pub-3940256099942544/9257395921";
    /** Production App Open unit — release builds only. */
    private static final String PROD_AD_UNIT_ID = "ca-app-pub-1105316876893505/1262198432";

    /** Mirrors the required ad states; reported honestly to JS. */
    public enum AdState {
        NOT_INITIALIZED, INITIALIZING, LOADING, LOADED, SHOWING,
        DISMISSED, FAILED, EXPIRED, NOT_AVAILABLE
    }

    public interface StateListener {
        void onAdState(AdState state, String detail);
    }

    private final Application application;
    private StateListener listener;

    /** Debuggable (debug build) -> test ads; release -> production unit. */
    private boolean isDebuggable() {
        try {
            return (application.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        } catch (Exception e) {
            return false;
        }
    }

    public boolean isTestUnit() {
        return isDebuggable();
    }

    public String activeAdUnitId() {
        return isDebuggable() ? TEST_AD_UNIT_ID : PROD_AD_UNIT_ID;
    }

    private AdState state = AdState.NOT_INITIALIZED;
    private String stateDetail = "";
    private AppOpenAd appOpenAd;
    private long loadTimeMs;
    private long lastShownMs;
    private int loadFailures;
    private long nextRetryAtMs;
    // Last real SDK errors (codes always; messages are SDK diagnostic text).
    private int lastLoadCode = -1;
    private String lastLoadMessage = "";
    private int lastShowCode = -1;
    private String lastShowMessage = "";

    private boolean adsAllowed;    // FREE plan (set from verified entitlement)
    private boolean criticalBusy;  // FRIDAY critical op running (set from JS)
    private boolean showingAd;
    private boolean consentFlowDone;
    private boolean initStarted;
    private boolean mobileAdsInitDone;

    private Activity currentActivity;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    public AppOpenAdManager(Application application) {
        this.application = application;
    }

    public void setStateListener(StateListener listener) {
        this.listener = listener;
    }

    public AdState getState() {
        return state;
    }

    public long getLastShownMs() {
        return lastShownMs;
    }

    /** Called from MainActivity so show() has a foreground Activity. */
    public void setCurrentActivity(Activity activity) {
        this.currentActivity = activity;
    }

    private void emit(AdState next, String detail) {
        state = next;
        stateDetail = detail == null ? "" : detail;
        try {
            if (listener != null) listener.onAdState(next, stateDetail);
        } catch (Exception e) {
            Log.w(TAG, "listener failed", e);
        }
    }

    /**
     * Development diagnostics with fixed event tags. Verbose lines only on
     * debuggable builds; warnings always. Never logs keys, tokens, or
     * personal data — only SDK codes/messages and gate booleans.
     */
    private void diag(String event, String detail) {
        String line = event + (detail == null || detail.isEmpty() ? "" : " " + detail);
        if (isDebuggable()) {
            Log.d(TAG, line);
        } else if (event.endsWith("FAILURE")) {
            Log.w(TAG, line);
        }
    }

    public String getStateDetail() {
        return stateDetail;
    }

    public int getLastLoadCode() {
        return lastLoadCode;
    }

    public String getLastLoadMessage() {
        return lastLoadMessage;
    }

    public int getLastShowCode() {
        return lastShowCode;
    }

    public String getLastShowMessage() {
        return lastShowMessage;
    }

    public boolean isAdsAllowed() {
        return adsAllowed;
    }

    public boolean isCriticalBusy() {
        return criticalBusy;
    }

    public boolean isConsentDone() {
        return consentFlowDone;
    }

    public boolean isForeground() {
        Activity a = currentActivity;
        return a != null && !a.isFinishing();
    }

    public boolean isAdFreshNow() {
        return appOpenAd != null
                && AdPolicy.isFresh(loadTimeMs, new Date().getTime());
    }

    // ---- Configuration from the JS entitlement / critical-op layer ----

    /** FREE (verified) -> true; PRO/PLUS -> false. */
    public synchronized void setAdsAllowed(boolean allowed) {
        boolean was = this.adsAllowed;
        this.adsAllowed = allowed;
        Log.i(TAG, "adsAllowed=" + allowed);
        if (allowed && !was && consentFlowDone && isAdAvailable()) {
            // Became eligible with a fresh ad already loaded: stay quiet until
            // the next resume (never pop an ad mid-session).
            emit(AdState.LOADED, "eligible; waiting for resume");
        }
        if (!allowed && appOpenAd != null && !showingAd) {
            // Premium: drop any preloaded ad so it can never show.
            appOpenAd = null;
            emit(AdState.NOT_AVAILABLE, "premium; ad discarded");
        }
    }

    /** True while FRIDAY runs a critical operation (voice, call, transfer...). */
    public synchronized void setCriticalBusy(boolean busy) {
        this.criticalBusy = busy;
        Log.i(TAG, "criticalBusy=" + busy);
    }

    // ---- Startup: consent -> MobileAds init -> preload ----

    /** Starts UMP consent then MobileAds init. Needs a foreground Activity
     *  (UMP requires it); MainActivity calls this after setCurrentActivity.
     *  Never blocks app startup. */
    public synchronized void start() {
        if (consentFlowDone) return;
        // initStarted only prevents log spam; the consent check itself is
        // retryable (e.g. first attempt happened while offline).
        initStarted = true;
        Activity activity = currentActivity;
        if (activity == null || activity.isFinishing()) {
            emit(AdState.NOT_AVAILABLE, "waiting for activity");
            diag("ADMOB_INIT_START", "deferred; no foreground activity");
            return;
        }
        emit(AdState.INITIALIZING, isDebuggable() ? "debug; test ads" : "release");
        diag("ADMOB_INIT_START", isDebuggable() ? "debug" : "release");
        try {
            ConsentRequestParameters params = new ConsentRequestParameters.Builder().build();
            ConsentInformation consentInfo = UserMessagingPlatform.getConsentInformation(application);
            consentInfo.requestConsentInfoUpdate(
                    activity, params,
                    () -> mainHandler.post(() -> onConsentInfoUpdated(consentInfo)),
                    formError -> {
                        // Consent check failed (offline etc.): keep FRIDAY running,
                        // retry consent on the next resume. Never block startup.
                        Log.w(TAG, "consent info failed: " + formError.getMessage());
                        mainHandler.post(() -> {
                            emit(AdState.NOT_AVAILABLE, "consent check unavailable");
                            consentFlowDone = false;
                        });
                    });
        } catch (Exception e) {
            Log.w(TAG, "consent start failed", e);
            emit(AdState.NOT_AVAILABLE, "consent unavailable");
            consentFlowDone = false;
        }
    }

    private void onConsentInfoUpdated(ConsentInformation consentInfo) {
        try {
            Activity activity = currentActivity;
            if (consentInfo.isConsentFormAvailable()
                    && consentInfo.getConsentStatus() == ConsentInformation.ConsentStatus.REQUIRED
                    && activity != null && !activity.isFinishing()) {
                UserMessagingPlatform.loadAndShowConsentFormIfRequired(
                        activity,
                        formError -> {
                            // Whether or not the form showed, continue: if ads
                            // still cannot be requested, loads stay disabled.
                            Log.i(TAG, "consent form done: "
                                    + (formError == null ? "ok" : formError.getMessage()));
                            initMobileAds(consentInfo);
                        });
                return;
            }
        } catch (Exception e) {
            Log.w(TAG, "consent form failed", e);
        }
        initMobileAds(consentInfo);
    }

    private void initMobileAds(ConsentInformation consentInfo) {
        if (mobileAdsInitDone) {
            // SDK already initialized (e.g. consent retried after offline
            // start): just re-evaluate requestability and preload.
            boolean canRequest;
            try {
                canRequest = consentInfo == null || consentInfo.canRequestAds();
            } catch (Exception e) {
                canRequest = true;
            }
            consentFlowDone = true;
            if (!canRequest) {
                emit(AdState.NOT_AVAILABLE, "consent: ads not requestable");
                return;
            }
            emit(AdState.NOT_AVAILABLE, "initialized; awaiting preload");
            preload();
            return;
        }
        mobileAdsInitDone = true;
        try {
            MobileAds.initialize(application, initializationStatus -> {
                StringBuilder adapters = new StringBuilder();
                try {
                    Map<String, AdapterStatus> map = initializationStatus.getAdapterStatusMap();
                    for (Map.Entry<String, AdapterStatus> e : map.entrySet()) {
                        adapters.append(e.getKey()).append('=')
                                .append(e.getValue().getInitializationState()).append(';');
                    }
                } catch (Exception ignored) { /* diagnostics only */ }
                Log.i(TAG, "MobileAds initialized: " + adapters);
                diag("ADMOB_INIT_SUCCESS", adapters.toString());
                boolean canRequest;
                try {
                    canRequest = consentInfo == null || consentInfo.canRequestAds();
                } catch (Exception e) {
                    canRequest = true;
                }
                consentFlowDone = true;
                if (!canRequest) {
                    emit(AdState.NOT_AVAILABLE, "consent: ads not requestable");
                    return;
                }
                emit(AdState.NOT_AVAILABLE, "initialized; awaiting preload");
                preload();
            });
        } catch (Exception e) {
            Log.w(TAG, "MobileAds init failed", e);
            diag("ADMOB_INIT_FAILURE", "init exception");
            emit(AdState.FAILED, "init exception");
        }
    }

    // ---- Load / show ----

    private boolean isOnline() {
        try {
            ConnectivityManager cm =
                    (ConnectivityManager) application.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            NetworkCapabilities caps = cm.getNetworkCapabilities(cm.getActiveNetwork());
            return caps != null && (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
                    || caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)
                    || caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET));
        } catch (Exception e) {
            return false;
        }
    }

    /** True only when the loaded ad is fresh (expiry enforced here). */
    private synchronized boolean isAdAvailable() {
        if (appOpenAd == null) return false;
        if (!AdPolicy.isFresh(loadTimeMs, new Date().getTime())) {
            appOpenAd = null;
            if (state == AdState.LOADED) {
                emit(AdState.EXPIRED, "older than 4h; discarded");
                diag("APP_OPEN_LOAD_FAILURE", "stale ad discarded");
            }
            return false;
        }
        return true;
    }

    /** Preload an ad when eligible. Safe to call often; guards do the work. */
    public synchronized void preload() {
        if (!consentFlowDone || !adsAllowed) return;
        if (showingAd || isAdAvailable()) return;
        if (state == AdState.LOADING) return;
        long now = new Date().getTime();
        if (now < nextRetryAtMs) return;
        if (!isOnline()) return; // offline: don't wait, don't block, just skip
        Context ctx = currentActivity != null ? currentActivity : application;
        emit(AdState.LOADING, isTestUnit() ? "test unit" : "production unit");
        diag("APP_OPEN_LOAD_START", isTestUnit() ? "test unit" : "production unit");
        AdRequest request = new AdRequest.Builder().build();
        try {
            AppOpenAd.load(ctx, activeAdUnitId(), request,
                    new AppOpenAd.AppOpenAdLoadCallback() {
                        @Override
                        public void onAdLoaded(@NonNull AppOpenAd ad) {
                            synchronized (AppOpenAdManager.this) {
                                appOpenAd = ad;
                                loadTimeMs = new Date().getTime();
                                loadFailures = 0;
                                nextRetryAtMs = 0;
                                lastLoadCode = 0;
                                lastLoadMessage = "";
                                emit(AdState.LOADED, "sdk confirmed");
                                diag("APP_OPEN_LOAD_SUCCESS", "sdk confirmed");
                            }
                        }

                        @Override
                        public void onAdFailedToLoad(@NonNull LoadAdError loadAdError) {
                            synchronized (AppOpenAdManager.this) {
                                appOpenAd = null;
                                loadFailures++;
                                nextRetryAtMs = new Date().getTime()
                                        + AdPolicy.backoffDelayMs(loadFailures);
                                lastLoadCode = loadAdError.getCode();
                                lastLoadMessage = String.valueOf(loadAdError.getMessage());
                                // Never raw stack traces to users: code only.
                                emit(AdState.FAILED, "code=" + loadAdError.getCode());
                                diag("APP_OPEN_LOAD_FAILURE", "code=" + loadAdError.getCode()
                                        + " message=" + loadAdError.getMessage());
                                Log.w(TAG, "load failed code=" + loadAdError.getCode());
                            }
                        }
                    });
        } catch (Exception e) {
            Log.w(TAG, "load threw", e);
            diag("APP_OPEN_LOAD_FAILURE", "load exception");
            emit(AdState.FAILED, "load exception");
        }
    }

    /** Shows on app resume only when every gate passes. */
    private synchronized void maybeShowOnResume() {
        long now = new Date().getTime();
        boolean fresh = isAdAvailable();
        boolean cooldownOk = AdPolicy.cooldownElapsed(lastShownMs, now);
        Activity activity = currentActivity;
        boolean hasActivity = activity != null && !activity.isFinishing();
        diag("APP_OPEN_SHOW_START",
                "alreadyShowing=" + showingAd
                + " entitlement=" + adsAllowed
                + " foreground=" + hasActivity
                + " stale=" + (!fresh)
                + " criticalBusy=" + criticalBusy);
        if (!AdPolicy.canShow(consentFlowDone, adsAllowed, showingAd,
                criticalBusy, fresh, cooldownOk, hasActivity)) {
            // Not eligible: keep a preload attempt cheap for later eligibility.
            if (!fresh) preload();
            return;
        }
        final AppOpenAd ad = appOpenAd;
        showingAd = true;
        emit(AdState.SHOWING, "resume");
        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override
            public void onAdDismissedFullScreenContent() {
                synchronized (AppOpenAdManager.this) {
                    showingAd = false;
                    appOpenAd = null; // an App Open ad shows once; reload next
                    lastShownMs = new Date().getTime();
                    emit(AdState.DISMISSED, "returning to FRIDAY");
                    diag("APP_OPEN_DISMISSED", "returning to FRIDAY");
                    preload(); // prepare the next eligible opportunity
                }
            }

            @Override
            public void onAdFailedToShowFullScreenContent(@NonNull AdError adError) {
                synchronized (AppOpenAdManager.this) {
                    showingAd = false;
                    appOpenAd = null;
                    lastShowCode = adError.getCode();
                    lastShowMessage = String.valueOf(adError.getMessage());
                    emit(AdState.FAILED, "show code=" + adError.getCode());
                    diag("APP_OPEN_SHOW_FAILURE", "code=" + adError.getCode()
                            + " message=" + adError.getMessage());
                    Log.w(TAG, "show failed code=" + adError.getCode());
                    // Guarded reload for a later resume (backoff-gated).
                    nextRetryAtMs = new Date().getTime()
                            + AdPolicy.backoffDelayMs(Math.max(loadFailures, 1));
                    preload();
                }
            }

            @Override
            public void onAdShowedFullScreenContent() {
                // Display actually confirmed by the SDK.
                lastShowCode = 0;
                lastShowMessage = "";
                diag("APP_OPEN_SHOW_SUCCESS", "sdk confirmed");
                Log.i(TAG, "app open ad displayed");
            }
        });
        try {
            ad.show(activity);
        } catch (Exception e) {
            showingAd = false;
            appOpenAd = null;
            Log.w(TAG, "show threw", e);
            diag("APP_OPEN_SHOW_FAILURE", "show exception");
            emit(AdState.FAILED, "show exception");
        }
    }

    // ---- Process lifecycle: resume = the only show moment ----

    @Override
    public void onResume(@NonNull LifecycleOwner owner) {
        // Consent may have been unavailable offline at startup: retry the flow.
        if (!consentFlowDone && !initStarted) {
            start();
            return;
        }
        if (!consentFlowDone) {
            start();
            return;
        }
        maybeShowOnResume();
    }
}
