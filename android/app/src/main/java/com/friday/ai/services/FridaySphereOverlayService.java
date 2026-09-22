package com.friday.ai.services;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.RadialGradient;
import android.graphics.Shader;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import java.util.Random;

public class FridaySphereOverlayService extends Service {

    private static final String CHANNEL_ID = "friday_sphere_channel";
    private static final int NOTIFICATION_ID = 7777;
    private static final int ANIMATION_FPS = 24;
    private static final long FRAME_DELAY = 1000 / ANIMATION_FPS;

    private WindowManager windowManager;
    private SphereView sphereView;
    private WindowManager.LayoutParams params;
    private Handler handler = new Handler(Looper.getMainLooper());
    private boolean isRunning = false;

    // State: 0=idle, 1=listening, 2=processing, 3=speaking, 4=error
    private int currentState = 0;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getStringExtra("action");
            if ("state".equals(action)) {
                currentState = intent.getIntExtra("state", 0);
                if (sphereView != null) {
                    sphereView.setState(currentState);
                }
                return START_STICKY;
            }
            if ("stop".equals(action)) {
                stopOverlay();
                stopSelf();
                return START_NOT_STICKY;
            }
        }

        if (!isRunning) {
            startOverlay();
        }
        return START_STICKY;
    }

    private void startOverlay() {
        try {
            startForeground(NOTIFICATION_ID, buildNotification());
            windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);

            sphereView = new SphereView(this);

            int type = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                type = WindowManager.LayoutParams.TYPE_PHONE;
            }

            params = new WindowManager.LayoutParams(
                dpToPx(120), dpToPx(120),
                type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE |
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL |
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT
            );
            params.gravity = Gravity.BOTTOM | Gravity.END;
            params.x = dpToPx(16);
            params.y = dpToPx(180);

            windowManager.addView(sphereView, params);
            isRunning = true;
        } catch (Exception e) {
            stopSelf();
        }
    }

    private void stopOverlay() {
        if (sphereView != null && windowManager != null) {
            try {
                windowManager.removeView(sphereView);
            } catch (Exception e) {}
            sphereView = null;
        }
        isRunning = false;
    }

    @Override
    public void onDestroy() {
        stopOverlay();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "JARVIS Sphere",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("JARVIS floating sphere");
            channel.setShowBadge(false);
            channel.setSound(null, null);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification() {
        Intent notifIntent = new Intent(this, com.friday.ai.MainActivity.class);
        PendingIntent pending = PendingIntent.getActivity(this, 0, notifIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("JARVIS")
            .setContentText("Sphere active")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pending)
            .setOngoing(true)
            .setSilent(true)
            .build();
    }

    private int dpToPx(int dp) {
        return (int)(dp * getResources().getDisplayMetrics().density);
    }

    // Inner class: Sphere View
    private class SphereView extends View {
        private float phase = 0f;
        private float pulsePhase = 0f;
        private float orbPhase = 0f;
        private int state = 0;
        private final Paint bgPaint = new Paint();
        private final Paint spherePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint glowPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint ringPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint particlePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Random random = new Random();
        private float[] particleAngle = new float[12];
        private float[] particleSpeed = new float[12];
        private float[] particleAlpha = new float[12];
        private float[] particleSize = new float[12];
        private final Handler animHandler = new Handler(Looper.getMainLooper());

        private final int[] stateColors = {
            Color.parseColor("#06b6d4"), // idle - cyan
            Color.parseColor("#10b981"), // listening - green
            Color.parseColor("#f59e0b"), // processing - amber
            Color.parseColor("#3b82f6"), // speaking - blue
            Color.parseColor("#ef4444"), // error - red
        };

        private final Runnable animRunnable = new Runnable() {
            @Override
            public void run() {
                invalidate();
                animHandler.postDelayed(this, FRAME_DELAY);
            }
        };

        SphereView(android.content.Context ctx) {
            super(ctx);
            setLayerType(LAYER_TYPE_SOFTWARE, null);
            bgPaint.setColor(Color.TRANSPARENT);
            ringPaint.setStyle(Paint.Style.STROKE);
            ringPaint.setStrokeWidth(1.5f);
            particlePaint.setStyle(Paint.Style.FILL);
            for (int i = 0; i < particleAngle.length; i++) {
                particleAngle[i] = (float)(Math.PI * 2 * i / particleAngle.length);
                particleSpeed[i] = 0.3f + random.nextFloat() * 0.5f;
                particleAlpha[i] = 0.3f + random.nextFloat() * 0.4f;
                particleSize[i] = 1f + random.nextFloat() * 2f;
            }

            setOnTouchListener(new OnTouchListener() {
                private float lastX, lastY;
                private boolean moved = false;
                @Override
                public boolean onTouch(View v, MotionEvent event) {
                    switch (event.getAction()) {
                        case MotionEvent.ACTION_DOWN:
                            lastX = event.getRawX();
                            lastY = event.getRawY();
                            moved = false;
                            return true;
                        case MotionEvent.ACTION_MOVE:
                            float dx = event.getRawX() - lastX;
                            float dy = event.getRawY() - lastY;
                            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) moved = true;
                            params.x -= (int)dx;
                            params.y += (int)dy;
                            lastX = event.getRawX();
                            lastY = event.getRawY();
                            windowManager.updateViewLayout(SphereView.this, params);
                            return true;
                        case MotionEvent.ACTION_UP:
                            if (!moved) {
                                // Tap: send intent to open JARVIS
                                Intent intent = new Intent(FridaySphereOverlayService.this, com.friday.ai.MainActivity.class);
                                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                startActivity(intent);
                            }
                            return true;
                    }
                    return false;
                }
            });
        }

        void setState(int newState) {
            this.state = newState;
        }

        @Override
        protected void onAttachedToWindow() {
            super.onAttachedToWindow();
            animHandler.post(animRunnable);
        }

        @Override
        protected void onDetachedFromWindow() {
            animHandler.removeCallbacks(animRunnable);
            super.onDetachedFromWindow();
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            int w = getWidth();
            int h = getHeight();
            float cx = w / 2f;
            float cy = h / 2f;
            float radius = Math.min(w, h) * 0.35f;

            int color = stateColors[state];
            int r = Color.red(color), g = Color.green(color), b = Color.blue(color);

            // Transparent background
            canvas.drawColor(Color.TRANSPARENT, android.graphics.PorterDuff.Mode.CLEAR);

            float breathe = 1f + 0.06f * (float)Math.sin(pulsePhase);

            // Outer glow
            for (int i = 4; i >= 1; i--) {
                float glowR = radius * (1.5f + i * 0.4f) * breathe;
                int alpha = 20 + (4 - i) * 10;
                RadialGradient grad = new RadialGradient(
                    cx, cy, glowR,
                    new int[]{ Color.argb(alpha, r, g, b), Color.TRANSPARENT },
                    new float[]{ 0.6f, 1f }, Shader.TileMode.CLAMP
                );
                glowPaint.setShader(grad);
                canvas.drawCircle(cx, cy, glowR, glowPaint);
            }

            // Orbital ring
            float rx = radius * 1.6f * breathe;
            float ry = radius * 0.4f;
            canvas.save();
            canvas.rotate((float)Math.toDegrees(orbPhase * 0.3), cx, cy);
            ringPaint.setColor(Color.argb(50, r, g, b));
            canvas.drawOval(cx - rx, cy - ry, cx + rx, cy + ry, ringPaint);
            canvas.restore();

            // Main sphere
            RadialGradient sphereGrad = new RadialGradient(
                cx, cy, radius * breathe,
                new int[]{ Color.WHITE, Color.argb(200, r, g, b), color, Color.argb(100, r, g, b), Color.TRANSPARENT },
                new float[]{ 0f, 0.1f, 0.4f, 0.75f, 1f },
                Shader.TileMode.CLAMP
            );
            spherePaint.setShader(sphereGrad);
            canvas.drawCircle(cx, cy, radius * breathe, spherePaint);

            // Particles
            for (int i = 0; i < particleAngle.length; i++) {
                float angle = particleAngle[i] + phase * particleSpeed[i];
                float dist = radius * (1.1f + 0.4f * (float)Math.sin(orbPhase + i));
                float px = cx + (float)Math.cos(angle) * dist;
                float py = cy + (float)Math.sin(angle) * dist * 0.7f;
                int alpha = (int)(particleAlpha[i] * 255 * (0.4f + 0.6f * (float)Math.sin(pulsePhase + i * 0.5f)));
                particlePaint.setColor(Color.argb(Math.max(0, Math.min(255, alpha)), r, g, b));
                canvas.drawCircle(px, py, particleSize[i], particlePaint);
            }

            phase += 0.015f;
            pulsePhase += 0.035f;
            orbPhase += 0.012f;
        }
    }
}
