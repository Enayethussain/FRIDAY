import { ORB_GESTURE } from './orbConfig';

/**
 * Mouse / touch fallback interaction (camera NOT required).
 * Desktop: drag = rotate, wheel = zoom.
 * Mobile: one-finger drag = rotate, two-finger pinch = zoom.
 * All deltas are applied to the scene; this class owns no rendering.
 */
export interface PointerDeltas {
  onRotate: (dxRad: number, dyRad: number) => void;
  onZoom: (next: number) => void;
  getZoom: () => number;
}

export class OrbPointerControl {
  private el: HTMLElement;
  private cb: PointerDeltas;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private pinchD = 0;
  private disposed = false;

  constructor(el: HTMLElement, cb: PointerDeltas) {
    this.el = el;
    this.cb = cb;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('touchmove', this.onTouchMove, { passive: true });
    el.addEventListener('touchend', this.onTouchEnd);
  }

  private onDown = (e: PointerEvent) => {
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    try { this.el.setPointerCapture(e.pointerId); } catch { /* noop */ }
  };

  private onMove = (e: PointerEvent) => {
    if (!this.dragging || this.disposed) return;
    const dx = (e.clientX - this.lastX) / ORB_GESTURE.rotatePxPerRad;
    const dy = (e.clientY - this.lastY) / ORB_GESTURE.rotatePxPerRad;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.cb.onRotate(dx, dy);
  };

  private onUp = () => { this.dragging = false; };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const next = this.cb.getZoom() + e.deltaY * 0.0016;
    this.cb.onZoom(next);
  };

  private onTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const d = Math.hypot(dx, dy);
      if (this.pinchD > 0) this.cb.onZoom(this.cb.getZoom() + ((this.pinchD - d) * 0.004));
      this.pinchD = d;
    }
  };

  private onTouchEnd = () => { this.pinchD = 0; };

  dispose() {
    this.disposed = true;
    this.el.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    this.el.removeEventListener('wheel', this.onWheel);
    this.el.removeEventListener('touchmove', this.onTouchMove);
    this.el.removeEventListener('touchend', this.onTouchEnd);
  }
}
