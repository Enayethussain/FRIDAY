package com.friday.ai.plugins;

import android.app.Activity;

import androidx.annotation.NonNull;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.friday.ai.FridayApp;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Capacitor bridge for FRIDAY subscriptions ("FridayBilling", Play Billing
 * Library 8). The client ONLY collects purchase tokens and displays Play's
 * localized prices — entitlement is granted exclusively by the backend after
 * Play Developer API verification. No purchase secret lives in the APK.
 */
@CapacitorPlugin(name = "FridayBilling")
public class BillingPlugin extends Plugin {

    private static final String[] PRODUCT_IDS = {
            "friday_pro_monthly", "friday_pro_3_month", "friday_pro_yearly",
            "friday_plus_monthly", "friday_plus_3_month", "friday_plus_yearly"
    };

    private BillingClient billingClient;
    private boolean connecting;
    // productId -> details cache for launching flows with the right offer token
    private final Map<String, ProductDetails> detailsCache = new HashMap<>();

    private synchronized BillingClient client() {
        if (billingClient != null) return billingClient;
        try {
            billingClient = BillingClient.newBuilder(getContext())
                    .setListener(this::onPurchasesUpdated)
                    .enablePendingPurchases(PendingPurchasesParams.newBuilder()
                            .enableOneTimeProducts().build())
                    .enableAutoServiceReconnection()
                    .build();
        } catch (Exception e) {
            billingClient = null;
        }
        return billingClient;
    }

    private void ensureConnected(final Runnable onReady, final Runnable onFail) {
        BillingClient c = client();
        if (c == null) {
            if (onFail != null) onFail.run();
            return;
        }
        if (c.isReady()) {
            if (onReady != null) onReady.run();
            return;
        }
        synchronized (this) {
            if (connecting) {
                if (onFail != null) onFail.run();
                return;
            }
            connecting = true;
        }
        try {
            c.startConnection(new BillingClientStateListener() {
                @Override
                public void onBillingSetupFinished(@NonNull BillingResult r) {
                    synchronized (BillingPlugin.this) { connecting = false; }
                    if (r.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                        if (onReady != null) getActivity().runOnUiThread(onReady);
                    } else if (onFail != null) {
                        getActivity().runOnUiThread(onFail);
                    }
                }

                @Override
                public void onBillingServiceDisconnected() {
                    synchronized (BillingPlugin.this) { connecting = false; }
                }
            });
        } catch (Exception e) {
            synchronized (BillingPlugin.this) { connecting = false; }
            if (onFail != null) onFail.run();
        }
    }

    private void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        // Never grant here — JS forwards tokens to the backend for verification.
        try {
            JSObject evt = new JSObject();
            evt.put("responseCode", result.getResponseCode());
            JSArray arr = new JSArray();
            if (purchases != null) {
                for (Purchase p : purchases) {
                    JSObject o = new JSObject();
                    List<String> ids = p.getProducts();
                    o.put("productId", (ids != null && !ids.isEmpty()) ? ids.get(0) : "");
                    o.put("purchaseToken", p.getPurchaseToken());
                    o.put("state", p.getPurchaseState() == Purchase.PurchaseState.PURCHASED
                            ? "PURCHASED" : "PENDING");
                    o.put("acknowledged", p.isAcknowledged());
                    arr.put(o);
                }
            }
            evt.put("purchases", arr);
            notifyListeners("purchaseUpdate", evt);
        } catch (Exception ignored) { /* event-only */ }
    }

    private static String firstPhasePrice(ProductDetails d) {
        try {
            List<ProductDetails.SubscriptionOfferDetails> offers = d.getSubscriptionOfferDetails();
            if (offers != null && !offers.isEmpty()) {
                List<ProductDetails.PricingPhase> phases =
                        offers.get(0).getPricingPhases().getPricingPhaseList();
                if (phases != null && !phases.isEmpty()) return phases.get(0).getFormattedPrice();
            }
        } catch (Exception ignored) { /* fall through */ }
        return "";
    }

    private static String firstOfferToken(ProductDetails d) {
        try {
            List<ProductDetails.SubscriptionOfferDetails> offers = d.getSubscriptionOfferDetails();
            if (offers != null && !offers.isEmpty()) return offers.get(0).getOfferToken();
        } catch (Exception ignored) { /* fall through */ }
        return "";
    }

    /**
     * Full offer inspection: every offer Play returns, with exact tokens and
     * pricing phases. Nothing is constructed — tokens come only from Play.
     */
    private static JSArray offersOf(ProductDetails d) {
        JSArray offers = new JSArray();
        try {
            List<ProductDetails.SubscriptionOfferDetails> list = d.getSubscriptionOfferDetails();
            if (list == null) return offers;
            for (ProductDetails.SubscriptionOfferDetails o : list) {
                JSObject oo = new JSObject();
                oo.put("offerId", o.getOfferId() != null ? o.getOfferId() : "");
                oo.put("basePlanId", o.getBasePlanId() != null ? o.getBasePlanId() : "");
                oo.put("offerToken", o.getOfferToken() != null ? o.getOfferToken() : "");
                try {
                    List<String> tags = o.getOfferTags();
                    JSArray ta = new JSArray();
                    if (tags != null) for (String t : tags) ta.put(t);
                    oo.put("offerTags", ta);
                } catch (Exception ignored) { oo.put("offerTags", new JSArray()); }
                JSArray phases = new JSArray();
                try {
                    List<ProductDetails.PricingPhase> pl =
                            o.getPricingPhases().getPricingPhaseList();
                    if (pl != null) {
                        for (ProductDetails.PricingPhase ph : pl) {
                            JSObject po = new JSObject();
                            po.put("formattedPrice", ph.getFormattedPrice());
                            po.put("billingPeriod", ph.getBillingPeriod());
                            po.put("priceCurrencyCode", ph.getPriceCurrencyCode());
                            po.put("priceAmountMicros", ph.getPriceAmountMicros());
                            try {
                                po.put("recurrenceMode", ph.getRecurrenceMode());
                            } catch (Exception ignored) { po.put("recurrenceMode", 0); }
                            phases.put(po);
                        }
                    }
                } catch (Exception ignored) { /* phases best-effort */ }
                oo.put("pricingPhases", phases);
                offers.put(oo);
            }
        } catch (Exception ignored) { /* offers best-effort */ }
        return offers;
    }

    /** Play availability (Play Store present + owned device). Never throws. */
    @PluginMethod
    public void isAvailable(PluginCall call) {
        try {
            BillingClient c = client();
            if (c == null) {
                JSObject r = new JSObject();
                r.put("available", false);
                r.put("reason", "PLAY_UNAVAILABLE");
                call.resolve(r);
                return;
            }
            ensureConnected(() -> {
                JSObject r = new JSObject();
                r.put("available", true);
                call.resolve(r);
            }, () -> {
                JSObject r = new JSObject();
                r.put("available", false);
                r.put("reason", "PLAY_UNAVAILABLE");
                call.resolve(r);
            });
        } catch (Exception e) {
            JSObject r = new JSObject();
            r.put("available", false);
            r.put("reason", "PLAY_UNAVAILABLE");
            call.resolve(r);
        }
    }

    /** Play's localized prices — authoritative for checkout display. */
    @PluginMethod
    public void queryProducts(PluginCall call) {
        ensureConnected(() -> {
            try {
                List<QueryProductDetailsParams.Product> list = new ArrayList<>();
                for (String id : PRODUCT_IDS) {
                    list.add(QueryProductDetailsParams.Product.newBuilder()
                            .setProductId(id)
                            .setProductType(BillingClient.ProductType.SUBS)
                            .build());
                }
                QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                        .setProductList(list).build();
                BillingClient c = client();
                if (c == null) {
                    call.resolve(emptyProducts());
                    return;
                }
                c.queryProductDetailsAsync(params, (billingResult, result) -> {
                    try {
                        JSArray arr = new JSArray();
                        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK
                                && result != null && result.getProductDetailsList() != null) {
                            for (ProductDetails d : result.getProductDetailsList()) {
                                detailsCache.put(d.getProductId(), d);
                                JSObject o = new JSObject();
                                o.put("productId", d.getProductId());
                                o.put("title", d.getTitle());
                                o.put("playPrice", firstPhasePrice(d));
                                o.put("offerToken", firstOfferToken(d));
                                o.put("offers", offersOf(d));
                                arr.put(o);
                            }
                        }
                        JSObject r = new JSObject();
                        r.put("products", arr);
                        call.resolve(r);
                    } catch (Exception e) {
                        call.resolve(emptyProducts());
                    }
                });
            } catch (Exception e) {
                call.resolve(emptyProducts());
            }
        }, () -> call.resolve(emptyProducts()));
    }

    private JSObject emptyProducts() {
        JSObject r = new JSObject();
        r.put("products", new JSArray());
        return r;
    }

    /**
     * Launches the Play purchase sheet with the EXACT offer token Play
     * returned. Optional oldPurchaseToken performs a Play-managed plan change
     * (upgrade/downgrade); Play owns all proration math. Result arrives via
     * purchaseUpdate; entitlement only comes from backend verification.
     */
    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId", "");
        String offerToken = call.getString("offerToken", "");
        String oldPurchaseToken = call.getString("oldPurchaseToken", "");
        Activity activity = getActivity();
        if (productId.isEmpty() || activity == null || activity.isFinishing()) {
            JSObject r = new JSObject();
            r.put("launched", false);
            r.put("code", "INVALID_REQUEST");
            call.resolve(r);
            return;
        }
        ensureConnected(() -> {
            try {
                ProductDetails details = detailsCache.get(productId);
                String token = (offerToken != null && !offerToken.isEmpty())
                        ? offerToken : (details != null ? firstOfferToken(details) : "");
                if (details == null || token.isEmpty()) {
                    JSObject r = new JSObject();
                    r.put("launched", false);
                    r.put("code", "PRODUCT_UNAVAILABLE");
                    call.resolve(r);
                    return;
                }
                BillingFlowParams.ProductDetailsParams pdp =
                        BillingFlowParams.ProductDetailsParams.newBuilder()
                                .setProductDetails(details)
                                .setOfferToken(token)
                                .build();
                List<BillingFlowParams.ProductDetailsParams> pdpList = new ArrayList<>();
                pdpList.add(pdp);
                BillingFlowParams.Builder flowBuilder = BillingFlowParams.newBuilder()
                        .setProductDetailsParamsList(pdpList);
                if (oldPurchaseToken != null && !oldPurchaseToken.isEmpty()) {
                    // Plan change: Play manages replacement; default
                    // CHARGE_FULL_PRICE mode (no custom proration math).
                    flowBuilder.setSubscriptionUpdateParams(
                            BillingFlowParams.SubscriptionUpdateParams.newBuilder()
                                    .setOldPurchaseToken(oldPurchaseToken)
                                    .setSubscriptionReplacementMode(
                                            BillingFlowParams.SubscriptionUpdateParams.ReplacementMode.CHARGE_FULL_PRICE)
                                    .build());
                }
                BillingFlowParams params = flowBuilder.build();
                BillingClient c = client();
                BillingResult br = c != null
                        ? c.launchBillingFlow(activity, params)
                        : null;
                JSObject r = new JSObject();
                boolean ok = br != null && br.getResponseCode() == BillingClient.BillingResponseCode.OK;
                r.put("launched", ok);
                if (!ok) r.put("code", "LAUNCH_FAILED");
                call.resolve(r);
            } catch (Exception e) {
                JSObject r = new JSObject();
                r.put("launched", false);
                r.put("code", "LAUNCH_FAILED");
                call.resolve(r);
            }
        }, () -> {
            JSObject r = new JSObject();
            r.put("launched", false);
            r.put("code", "PLAY_UNAVAILABLE");
            call.resolve(r);
        });
    }

    /** Existing purchases for restore (tokens go to the backend to verify). */
    @PluginMethod
    public void queryPurchases(PluginCall call) {
        ensureConnected(() -> {
            try {
                BillingClient c = client();
                if (c == null) {
                    call.resolve(emptyPurchases());
                    return;
                }
                QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
                        .setProductType(BillingClient.ProductType.SUBS).build();
                c.queryPurchasesAsync(params, (billingResult, purchases) -> {
                    try {
                        JSArray arr = new JSArray();
                        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK
                                && purchases != null) {
                            for (Purchase p : purchases) {
                                List<String> ids = p.getProducts();
                                JSObject o = new JSObject();
                                o.put("productId", (ids != null && !ids.isEmpty()) ? ids.get(0) : "");
                                o.put("purchaseToken", p.getPurchaseToken());
                                o.put("state", p.getPurchaseState() == Purchase.PurchaseState.PURCHASED
                                        ? "PURCHASED" : "PENDING");
                                o.put("acknowledged", p.isAcknowledged());
                                arr.put(o);
                            }
                        }
                        JSObject r = new JSObject();
                        r.put("purchases", arr);
                        call.resolve(r);
                    } catch (Exception e) {
                        call.resolve(emptyPurchases());
                    }
                });
            } catch (Exception e) {
                call.resolve(emptyPurchases());
            }
        }, () -> call.resolve(emptyPurchases()));
    }

    private JSObject emptyPurchases() {
        JSObject r = new JSObject();
        r.put("purchases", new JSArray());
        return r;
    }

    /**
     * Acknowledge AFTER the backend verifies + grants. Calling this is what
     * stops Play from auto-refunding; it is never called on failure.
     */
    @PluginMethod
    public void acknowledge(PluginCall call) {
        String token = call.getString("purchaseToken", "");
        if (token.isEmpty()) {
            JSObject r = new JSObject();
            r.put("acknowledged", false);
            call.resolve(r);
            return;
        }
        ensureConnected(() -> {
            try {
                BillingClient c = client();
                if (c == null) {
                    JSObject r = new JSObject();
                    r.put("acknowledged", false);
                    call.resolve(r);
                    return;
                }
                AcknowledgePurchaseParams params = AcknowledgePurchaseParams.newBuilder()
                        .setPurchaseToken(token).build();
                c.acknowledgePurchase(params, billingResult -> {
                    JSObject r = new JSObject();
                    r.put("acknowledged",
                            billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK);
                    call.resolve(r);
                });
            } catch (Exception e) {
                JSObject r = new JSObject();
                r.put("acknowledged", false);
                call.resolve(r);
            }
        }, () -> {
            JSObject r = new JSObject();
            r.put("acknowledged", false);
            call.resolve(r);
        });
    }
}
