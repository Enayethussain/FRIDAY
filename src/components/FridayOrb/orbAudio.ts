/**
 * Real-audio sampling helpers for the orb.
 *
 * sampleLevel() reads the attached AnalyserNode (mic while listening,
 * TTS output while speaking — StateManager.getActiveAnalyser already
 * routes correctly) and returns 0..1 voice intensity.
 *
 * idleBreath() is the ONLY synthetic motion: a slow deterministic sine
 * used when no audio node exists. It is documented as a fallback and
 * never presented as voice activity.
 */

/** RMS voice intensity 0..1 from a live analyser. Returns 0 on any failure. */
export function sampleLevel(analyser: AnalyserNode | null, scratch?: Uint8Array): number {
  if (!analyser) return 0;
  try {
    const n = Math.min(analyser.fftSize || 1024, 1024);
    const buf = scratch && scratch.length >= n ? scratch : new Uint8Array(n);
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    let count = 0;
    for (let i = 0; i < n; i += 2) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
      count++;
    }
    if (count === 0) return 0;
    return Math.min(1, Math.sqrt(sum / count) * 2.4);
  } catch {
    return 0;
  }
}

/** Slow deterministic breathing 0..1 for idle motion when audio is absent. */
export function idleBreath(t: number): number {
  return 0.5 + 0.5 * Math.sin(t * 0.9);
}
