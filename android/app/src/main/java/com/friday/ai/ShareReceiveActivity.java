package com.friday.ai;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;

/**
 * FRIDAY Share target: Gallery/Files -> Share -> FRIDAY.
 * Collects the shared content URIs, stashes them for ShareReceivePlugin,
 * then opens the main HUD (which shows the Share panel payload).
 * No upload happens here — the user still picks the target device and the
 * receiver must still accept. API 26+ (no new permissions needed; the
 * sending app grants one-shot read access to these URIs).
 */
public class ShareReceiveActivity extends BridgeActivity {

    public static final ArrayList<Uri> PENDING = new ArrayList<>();

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handleIntent(getIntent());
        // Hand off to the real HUD.
        Intent main = new Intent(this, MainActivity.class);
        main.setAction("friday.SHARED_FILES");
        main.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(main);
        finish();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        String type = intent.getType();
        if (type == null) type = "*/*";
        if (Intent.ACTION_SEND.equals(action)) {
            Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri != null) {
                synchronized (PENDING) {
                    PENDING.clear();
                    PENDING.add(uri);
                }
            }
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> uris = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (uris != null && !uris.isEmpty()) {
                synchronized (PENDING) {
                    PENDING.clear();
                    PENDING.addAll(uris);
                }
            }
        }
    }
}
