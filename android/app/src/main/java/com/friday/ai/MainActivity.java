package com.friday.ai;

import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.BridgeActivity;
import com.friday.ai.ads.AppOpenAdManager;
import com.friday.ai.plugins.AdsPlugin;
import com.friday.ai.plugins.AppUpdatePlugin;
import com.friday.ai.plugins.BillingPlugin;
import com.friday.ai.plugins.PhonePlugin;
import com.friday.ai.plugins.DeviceControlPlugin;
import com.friday.ai.plugins.AppLauncherPlugin;
import com.friday.ai.plugins.NotificationReaderPlugin;
import com.friday.ai.plugins.ScreenContextPlugin;
import com.friday.ai.plugins.SphereOverlayPlugin;
import com.friday.ai.plugins.ShareReceivePlugin;
import com.friday.ai.plugins.gesture.GesturePlugin;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AdsPlugin.class);
        registerPlugin(AppUpdatePlugin.class);
        registerPlugin(BillingPlugin.class);
        registerPlugin(PhonePlugin.class);
        registerPlugin(DeviceControlPlugin.class);
        registerPlugin(AppLauncherPlugin.class);
        registerPlugin(NotificationReaderPlugin.class);
        registerPlugin(ScreenContextPlugin.class);
        registerPlugin(SphereOverlayPlugin.class);
        registerPlugin(ShareReceivePlugin.class);
        registerPlugin(GesturePlugin.class);
        super.onCreate(savedInstanceState);
        // Give the App Open manager a foreground Activity for show() + consent,
        // then (re)start its async init flow.
        try {
            if (getApplication() instanceof FridayApp) {
                AppOpenAdManager m = ((FridayApp) getApplication()).getAdsManager();
                if (m != null) {
                    m.setCurrentActivity(this);
                    m.start();
                }
            }
        } catch (Exception ignored) { /* ads stay disabled-safe */ }
    }

    @Override
    public void onResume() {
        super.onResume();
        try {
            if (getApplication() instanceof FridayApp) {
                AppOpenAdManager m = ((FridayApp) getApplication()).getAdsManager();
                if (m != null) m.setCurrentActivity(this);
            }
        } catch (Exception ignored) { /* never break resume */ }
    }
}
