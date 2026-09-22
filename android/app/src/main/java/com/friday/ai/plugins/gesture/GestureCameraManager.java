package com.friday.ai.plugins.gesture;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.ImageFormat;
import android.graphics.Matrix;
import android.graphics.Rect;
import android.graphics.YuvImage;

import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.LifecycleOwner;

import com.google.common.util.concurrent.ListenableFuture;
import com.google.mediapipe.tasks.core.BaseOptions;
import com.google.mediapipe.tasks.vision.core.ImageProcessingOptions;
import com.google.mediapipe.tasks.vision.core.RunningMode;
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker;
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarkerResult;
import com.google.mediapipe.framework.image.BitmapImageBuilder;
import com.google.mediapipe.framework.image.MPImage;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * GestureCameraManager — CameraX + on-device MediaPipe HandLandmarker.
 *
 * Privacy (spec section 8): frames are analyzed in RAM only. No recording,
 * no uploads, no frame storage, no frame logging. Only normalized landmark
 * coordinates leave this class (to the classifier + optional test overlay).
 *
 * Performance (spec section 10): 640px analysis resolution, keep-latest
 * backpressure, ~15 FPS throttle, single background executor, full release
 * on stop (no leaked camera/threads/model).
 */
public final class GestureCameraManager {

    public interface Callback {
        /** Normalized hands: outer = hands, inner = 21 (x,y) points in 0..1. */
        void onHands(List<List<float[]>> hands, long timestampMs, float fps);

        void onError(String code, String message);
    }

    private static final int ANALYSIS_WIDTH = 640;
    private static final int ANALYSIS_HEIGHT = 480;
    private static final long MIN_FRAME_INTERVAL_MS = 66L; // ~15 FPS
    private static final String MODEL_ASSET = "hand_landmarker.task";

    private final Context context;
    private final Callback callback;

    private ExecutorService executor;
    private HandLandmarker landmarker;
    private ProcessCameraProvider cameraProvider;
    private final AtomicBoolean running = new AtomicBoolean(false);
    private volatile long lastAnalyzeMs;
    private volatile long lastFpsEmitMs;
    private volatile int framesInWindow;

    public GestureCameraManager(Context context, Callback callback) {
        this.context = context.getApplicationContext();
        this.callback = callback;
    }

    public boolean isRunning() {
        return running.get();
    }

    /** Bind camera + model. Must be called on the main thread. */
    public void start(LifecycleOwner owner, boolean useFrontCamera) {
        if (!running.compareAndSet(false, true)) return;
        executor = Executors.newSingleThreadExecutor();
        try {
            BaseOptions baseOptions = BaseOptions.builder()
                    .setModelAssetPath(MODEL_ASSET)
                    .build();
            HandLandmarker.HandLandmarkerOptions options =
                    HandLandmarker.HandLandmarkerOptions.builder()
                            .setBaseOptions(baseOptions)
                            .setNumHands(2)
                            .setMinHandDetectionConfidence(0.5f)
                            .setMinHandPresenceConfidence(0.5f)
                            .setMinTrackingConfidence(0.5f)
                            .setRunningMode(RunningMode.VIDEO)
                            .build();
            landmarker = HandLandmarker.createFromOptions(context, options);
        } catch (Exception e) {
            running.set(false);
            shutdownExecutor();
            callback.onError("MODEL_LOAD_FAILED",
                    "Hand model load nahi hua: " + e.getMessage());
            return;
        }
        ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(context);
        future.addListener(() -> {
            if (!running.get()) return;
            try {
                cameraProvider = future.get();
                ImageAnalysis analysis = new ImageAnalysis.Builder()
                        .setTargetResolution(
                                new android.util.Size(ANALYSIS_WIDTH, ANALYSIS_HEIGHT))
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .build();
                analysis.setAnalyzer(executor, this::analyze);
                CameraSelector selector = useFrontCamera
                        ? CameraSelector.DEFAULT_FRONT_CAMERA
                        : CameraSelector.DEFAULT_BACK_CAMERA;
                cameraProvider.unbindAll();
                // NOTE: Preview is intentionally NOT bound — gesture mode runs
                // headless (no preview surface) to save GPU/battery. Test-mode
                // overlay is drawn by the WebView from landmark coordinates.
                cameraProvider.bindToLifecycle(owner, selector, analysis);
            } catch (IllegalArgumentException e) {
                fail("CAMERA_UNAVAILABLE",
                        "Is device me requested camera nahi hai.");
            } catch (Exception e) {
                String msg = String.valueOf(e.getMessage());
                if (msg.contains("in use") || msg.contains("In use")
                        || msg.contains("CAMERA_IN_USE")) {
                    fail("CAMERA_IN_USE",
                            "Camera doosri app use kar rahi hai. Us app ko band karke retry karo.");
                } else {
                    fail("CAMERA_BIND_FAILED", "Camera start nahi hui: " + msg);
                }
            }
        }, ContextCompat.getMainExecutor(context));
    }

    /** Unbind camera + close model + stop thread. Safe to call twice. */
    public void stop() {
        if (!running.compareAndSet(true, false)) return;
        try {
            if (cameraProvider != null) cameraProvider.unbindAll();
        } catch (Exception ignored) {
        }
        try {
            if (landmarker != null) landmarker.close();
        } catch (Exception ignored) {
        }
        landmarker = null;
        cameraProvider = null;
        shutdownExecutor();
    }

    private void shutdownExecutor() {
        if (executor != null) {
            try {
                executor.shutdownNow();
            } catch (Exception ignored) {
            }
            executor = null;
        }
    }

    private void fail(String code, String message) {
        try {
            stop();
        } finally {
            callback.onError(code, message);
        }
    }

    private void analyze(ImageProxy proxy) {
        try {
            if (!running.get() || landmarker == null) return;
            long nowMs = System.currentTimeMillis();
            if (nowMs - lastAnalyzeMs < MIN_FRAME_INTERVAL_MS) return;
            lastAnalyzeMs = nowMs;

            Bitmap bitmap = yuvToBitmap(proxy);
            if (bitmap == null) return;
            int rotation = proxy.getImageInfo().getRotationDegrees();
            if (rotation != 0) bitmap = rotate(bitmap, rotation);

            MPImage mpImage = new BitmapImageBuilder(bitmap).build();
            ImageProcessingOptions processingOptions = ImageProcessingOptions.builder().build();
            HandLandmarkerResult result;
            try {
                result = landmarker.detectForVideo(mpImage, nowMs);
            } catch (Exception e) {
                return; // single bad frame — skip, never crash the loop
            } finally {
                try {
                    mpImage.close();
                } catch (Exception ignored) {
                }
                try {
                    bitmap.recycle();
                } catch (Exception ignored) {
                }
            }

            List<List<float[]>> hands = new ArrayList<>();
            try {
                for (List<com.google.mediapipe.tasks.components.containers.NormalizedLandmark> landmarks
                        : result.landmarks()) {
                    List<float[]> pts = new ArrayList<>(landmarks.size());
                    for (com.google.mediapipe.tasks.components.containers.NormalizedLandmark lm : landmarks) {
                        pts.add(new float[]{lm.x(), lm.y()});
                    }
                    hands.add(pts);
                }
            } catch (Exception e) {
                return;
            }

            framesInWindow++;
            float fps = -1f;
            if (nowMs - lastFpsEmitMs >= 1000L) {
                long dt = nowMs - lastFpsEmitMs;
                if (dt > 0 && lastFpsEmitMs > 0) fps = framesInWindow * 1000f / dt;
                framesInWindow = 0;
                lastFpsEmitMs = nowMs;
            }
            callback.onHands(hands, nowMs, fps);
        } finally {
            try {
                proxy.close();
            } catch (Exception ignored) {
            }
        }
    }

    // ---- YUV_420_888 -> Bitmap (no extra deps) ----

    private Bitmap yuvToBitmap(ImageProxy proxy) {
        try {
            if (proxy.getFormat() != ImageFormat.YUV_420_888) return null;
            ImageProxy.PlaneProxy[] planes = proxy.getPlanes();
            ByteBuffer y = planes[0].getBuffer();
            ByteBuffer u = planes[1].getBuffer();
            ByteBuffer v = planes[2].getBuffer();
            int ySize = y.remaining();
            int uSize = u.remaining();
            int vSize = v.remaining();
            byte[] nv21 = new byte[ySize + uSize + vSize];
            y.get(nv21, 0, ySize);
            // NV21 = Y + V + U interleaved; planes may have row stride — the
            // robust path below handles the common tightly-packed case and
            // falls back to null (frame skipped) otherwise.
            if (planes[0].getRowStride() != proxy.getWidth()) return null;
            v.get(nv21, ySize, vSize);
            u.get(nv21, ySize + vSize, uSize);
            YuvImage yuv = new YuvImage(nv21, ImageFormat.NV21,
                    proxy.getWidth(), proxy.getHeight(), null);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            yuv.compressToJpeg(new Rect(0, 0, proxy.getWidth(), proxy.getHeight()), 80, out);
            byte[] jpeg = out.toByteArray();
            return BitmapFactory.decodeByteArray(jpeg, 0, jpeg.length);
        } catch (Exception e) {
            return null;
        }
    }

    private Bitmap rotate(Bitmap bitmap, int degrees) {
        Matrix matrix = new Matrix();
        matrix.postRotate(degrees);
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
    }

    /** Front-camera selfie frames are mirrored — mirror x so swipes match the user. */
    public static float mirrorX(float x, boolean useFrontCamera) {
        return useFrontCamera ? 1f - x : x;
    }
}
