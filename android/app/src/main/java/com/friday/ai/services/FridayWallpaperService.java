package com.friday.ai.services;

import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.Shader;
import android.os.Handler;
import android.os.Looper;
import android.service.wallpaper.WallpaperService;
import android.view.SurfaceHolder;

import java.util.Random;

public class FridayWallpaperService extends WallpaperService {

    private static final float SPHERE_RADIUS_RATIO = 0.18f;
    private static final int ANIMATION_FPS = 30;
    private static final long FRAME_DELAY = 1000 / ANIMATION_FPS;

    @Override
    public Engine onCreateEngine() {
        return new FridayEngine();
    }

    private class FridayEngine extends Engine {
        private final Handler handler = new Handler(Looper.getMainLooper());
        private boolean visible = false;
        private float phase = 0f;
        private float pulsePhase = 0f;
        private float orbPhase = 0f;
        private final Random random = new Random();

        // Sphere colors - JARVIS cyan theme
        private final int coreColor = Color.parseColor("#06b6d4");
        private final int innerGlow = Color.parseColor("#22d3ee");
        private final int outerGlow = Color.parseColor("#0e7490");
        private final int bgDark = Color.parseColor("#020617");

        private final Paint spherePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint glowPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint bgPaint = new Paint();
        private final Paint ringPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint particlePaint = new Paint(Paint.ANTI_ALIAS_FLAG);

        private int width, height;
        private float cx, cy, sphereRadius;

        // Particles
        private float[] particleX = new float[20];
        private float[] particleY = new float[20];
        private float[] particleSpeed = new float[20];
        private float[] particleAngle = new float[20];
        private float[] particleAlpha = new float[20];
        private float[] particleSize = new float[20];

        FridayEngine() {
            bgPaint.setColor(bgDark);
            ringPaint.setStyle(Paint.Style.STROKE);
            ringPaint.setStrokeWidth(2f);
            particlePaint.setStyle(Paint.Style.FILL);
            initParticles();
        }

        private void initParticles() {
            for (int i = 0; i < particleX.length; i++) {
                particleAngle[i] = (float)(Math.PI * 2 * i / particleX.length);
                particleSpeed[i] = 0.3f + random.nextFloat() * 0.7f;
                particleAlpha[i] = 0.3f + random.nextFloat() * 0.5f;
                particleSize[i] = 1f + random.nextFloat() * 3f;
            }
        }

        private final Runnable drawRunner = new Runnable() {
            @Override
            public void run() {
                drawFrame();
            }
        };

        @Override
        public void onSurfaceCreated(SurfaceHolder holder) {
            super.onSurfaceCreated(holder);
        }

        @Override
        public void onSurfaceChanged(SurfaceHolder holder, int format, int w, int h) {
            super.onSurfaceChanged(holder, format, w, h);
            width = w;
            height = h;
            cx = w / 2f;
            cy = h / 2f;
            sphereRadius = Math.min(w, h) * SPHERE_RADIUS_RATIO;
        }

        @Override
        public void onVisibilityChanged(boolean visible) {
            this.visible = visible;
            if (visible) {
                drawFrame();
            } else {
                handler.removeCallbacks(drawRunner);
            }
        }

        @Override
        public void onSurfaceDestroyed(SurfaceHolder holder) {
            super.onSurfaceDestroyed(holder);
            visible = false;
            handler.removeCallbacks(drawRunner);
        }

        @Override
        public void onDestroy() {
            super.onDestroy();
            visible = false;
            handler.removeCallbacks(drawRunner);
        }

        private void drawFrame() {
            if (!visible) return;

            SurfaceHolder holder = getSurfaceHolder();
            Canvas canvas = null;
            try {
                canvas = holder.lockCanvas();
                if (canvas != null) {
                    drawSphere(canvas);
                }
            } finally {
                if (canvas != null) {
                    try {
                        holder.unlockCanvasAndPost(canvas);
                    } catch (Exception e) {}
                }
            }

            phase += 0.02f;
            pulsePhase += 0.04f;
            orbPhase += 0.015f;

            handler.removeCallbacks(drawRunner);
            if (visible) {
                handler.postDelayed(drawRunner, FRAME_DELAY);
            }
        }

        private void drawSphere(Canvas canvas) {
            int w = canvas.getWidth();
            int h = canvas.getHeight();

            // Semi-transparent dark background
            canvas.drawColor(Color.parseColor("#E6020617"));

            float radius = sphereRadius;
            float breathe = 1f + 0.05f * (float)Math.sin(pulsePhase);

            // Outer glow layers
            for (int i = 5; i >= 1; i--) {
                float glowRadius = radius * (1.5f + i * 0.5f) * breathe;
                int alpha = 15 + (5 - i) * 8;
                RadialGradient outerGrad = new RadialGradient(
                    cx, cy, glowRadius,
                    new int[]{ Color.argb(alpha, 6, 182, 212), Color.TRANSPARENT },
                    new float[]{ 0.6f, 1f },
                    Shader.TileMode.CLAMP
                );
                glowPaint.setShader(outerGrad);
                canvas.drawCircle(cx, cy, glowRadius, glowPaint);
            }

            // Orbital rings
            ringPaint.setStrokeWidth(1.5f);
            for (int i = 0; i < 3; i++) {
                float ringPhase = phase + i * (float)(Math.PI * 2 / 3);
                float rx = radius * 1.8f * breathe;
                float ry = radius * 0.5f;
                canvas.save();
                canvas.translate(cx, cy);
                canvas.rotate((float)Math.toDegrees(ringPhase * 0.5), 0, 0);
                ringPaint.setColor(Color.argb(40 + i * 10, 6, 182, 212));
                canvas.drawOval(-rx, -ry, rx, ry, ringPaint);
                canvas.restore();
            }

            // Main sphere gradient
            RadialGradient sphereGrad = new RadialGradient(
                cx, cy, radius * breathe,
                new int[]{
                    Color.WHITE,
                    innerGlow,
                    coreColor,
                    outerGlow,
                    Color.TRANSPARENT
                },
                new float[]{ 0f, 0.15f, 0.45f, 0.8f, 1f },
                Shader.TileMode.CLAMP
            );
            spherePaint.setShader(sphereGrad);
            canvas.drawCircle(cx, cy, radius * breathe, spherePaint);

            // Inner core highlight
            RadialGradient coreGrad = new RadialGradient(
                cx - radius * 0.15f, cy - radius * 0.2f, radius * 0.4f,
                new int[]{ Color.argb(180, 255, 255, 255), Color.TRANSPARENT },
                new float[]{ 0f, 1f },
                Shader.TileMode.CLAMP
            );
            glowPaint.setShader(coreGrad);
            canvas.drawCircle(cx - radius * 0.15f, cy - radius * 0.2f, radius * 0.4f, glowPaint);

            // Orbiting particles
            for (int i = 0; i < particleX.length; i++) {
                float angle = particleAngle[i] + phase * particleSpeed[i];
                float dist = radius * (1.2f + 0.6f * (float)Math.sin(orbPhase + i));
                float px = cx + (float)Math.cos(angle) * dist;
                float py = cy + (float)Math.sin(angle) * dist * 0.6f;

                int alpha = (int)(particleAlpha[i] * 255 * (0.5f + 0.5f * (float)Math.sin(pulsePhase + i * 0.5f)));
                particlePaint.setColor(Color.argb(Math.max(0, Math.min(255, alpha)), 34, 211, 238));
                canvas.drawCircle(px, py, particleSize[i], particlePaint);
            }

            // Subtle pulsing ring around sphere
            float pulseRadius = radius * (1.1f + 0.08f * (float)Math.sin(pulsePhase * 2));
            ringPaint.setStrokeWidth(2f);
            ringPaint.setColor(Color.argb(50, 6, 182, 212));
            canvas.drawCircle(cx, cy, pulseRadius, ringPaint);
        }
    }
}
