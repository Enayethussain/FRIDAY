package com.friday.ai.plugins;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.friday.ai.services.FridaySphereOverlayService;

@CapacitorPlugin(name = "SphereOverlay")
public class SphereOverlayPlugin extends Plugin {

    @PluginMethod
    public void startOverlay(PluginCall call) {
        int state = call.getInt("state", 0);
        if (!Settings.canDrawOverlays(getContext())) {
            call.reject("Overlay permission required");
            return;
        }
        Intent intent = new Intent(getContext(), FridaySphereOverlayService.class);
        intent.putExtra("action", "state");
        intent.putExtra("state", state);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        JSObject result = new JSObject();
        result.put("started", true);
        call.resolve(result);
    }

    @PluginMethod
    public void updateState(PluginCall call) {
        int state = call.getInt("state", 0);
        Intent intent = new Intent(getContext(), FridaySphereOverlayService.class);
        intent.putExtra("action", "state");
        intent.putExtra("state", state);
        getContext().startService(intent);
        JSObject result = new JSObject();
        result.put("updated", true);
        call.resolve(result);
    }

    @PluginMethod
    public void stopOverlay(PluginCall call) {
        Intent intent = new Intent(getContext(), FridaySphereOverlayService.class);
        intent.putExtra("action", "stop");
        getContext().startService(intent);
        JSObject result = new JSObject();
        result.put("stopped", true);
        call.resolve(result);
    }

    @PluginMethod
    public void checkOverlayPermission(PluginCall call) {
        boolean granted = Settings.canDrawOverlays(getContext());
        JSObject result = new JSObject();
        result.put("granted", granted);
        call.resolve(result);
    }

    @PluginMethod
    public void requestOverlayPermission(PluginCall call) {
        if (!Settings.canDrawOverlays(getContext())) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        JSObject result = new JSObject();
        result.put("granted", Settings.canDrawOverlays(getContext()));
        call.resolve(result);
    }
}
