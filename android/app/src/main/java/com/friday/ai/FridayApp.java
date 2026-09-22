package com.friday.ai;

import android.app.Application;

import androidx.lifecycle.ProcessLifecycleOwner;

import com.friday.ai.ads.AppOpenAdManager;

/**
 * FRIDAY Application: owns the App Open ad lifecycle. The observer fires only
 * on real foreground/background transitions, so rotation (handled via
 * configChanges, no recreation) and activity recreation never create
 * duplicate ad instances.
 */
public class FridayApp extends Application {

    private AppOpenAdManager adsManager;

    @Override
    public void onCreate() {
        super.onCreate();
        adsManager = new AppOpenAdManager(this);
        try {
            ProcessLifecycleOwner.get().getLifecycle().addObserver(adsManager);
        } catch (Exception ignored) {
            // Lifecycle unavailable: ads stay disabled, FRIDAY runs normally.
        }
        // Consent -> MobileAds init -> preload starts from MainActivity (UMP needs
        // a foreground Activity). Async; never blocks startup.
        adsManager.start();
    }

    public AppOpenAdManager getAdsManager() {
        return adsManager;
    }
}
