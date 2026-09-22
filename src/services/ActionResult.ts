/**
 * Structured phone-action results. The CORE honesty rule lives here:
 * a result is SUCCESS only when Android actually performed + confirmed
 * the action. Everything else is an explicit non-success status —
 * the UI/voice layer MUST render these honestly (see statusVoice()).
 */

export type ActionStatus =
  | 'SUCCESS'
  | 'FAILED'
  | 'TIMEOUT'
  | 'NOT_SUPPORTED'
  | 'PERMISSION_REQUIRED'
  | 'DEVICE_OFFLINE'
  | 'VERIFICATION_FAILED';

export interface ActionResult {
  status: ActionStatus;
  action: string;
  target: string;
  /** true only when the device confirmed completion */
  verified: boolean;
  /** short machine-readable detail, safe to display */
  message: string;
  /** raw native error text, if any (never secrets) */
  error?: string;
  latencyMs: number;
  data?: unknown;
}

export function actionOk(action: string, target: string, message: string, latencyMs = 0, data?: unknown): ActionResult {
  return { status: 'SUCCESS', action, target, verified: true, message, latencyMs, data };
}

export function actionFail(
  status: Exclude<ActionStatus, 'SUCCESS'>,
  action: string,
  target: string,
  message: string,
  latencyMs = 0,
  error?: string,
): ActionResult {
  return { status, action, target, verified: false, message, error, latencyMs };
}

/**
 * Race any plugin promise against a timeout. On timeout the action is
 * TIMEOUT — never success. Native may still resolve later; ignored.
 */
export async function withTimeout<T>(action: string, target: string, p: Promise<T>, ms: number): Promise<T> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(timeoutError(action, target, ms, Date.now() - started)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface TimeoutMark { __fridayTimeout: true; action: string; target: string; ms: number; latencyMs: number }
export function timeoutError(action: string, target: string, ms: number, latencyMs: number): TimeoutMark {
  return { __fridayTimeout: true, action, target, ms, latencyMs };
}
export function isTimeout(e: unknown): e is TimeoutMark {
  return !!e && typeof e === 'object' && (e as TimeoutMark).__fridayTimeout === true;
}

/** Classify a native rejection into an honest status. */
export function classifyNativeError(action: string, target: string, e: unknown, latencyMs: number): ActionResult {
  const raw = e instanceof Error ? e.message : String(e ?? 'unknown error');
  const low = raw.toLowerCase();
  if (isTimeout(e)) {
    return actionFail('TIMEOUT', action, target, `${target} se response nahi mila (${Math.round(e.ms / 1000)}s).`, e.latencyMs, raw);
  }
  if (/not installed|not found|no .* installed|activity not found/i.test(raw)) {
    return actionFail('FAILED', action, target, `${target} install nahi hai ya khul nahi sakta.`, latencyMs, raw);
  }
  if (/permission|unauthorized|denied|allow|not_allowed|require/i.test(raw)) {
    return actionFail('PERMISSION_REQUIRED', action, target, `${target} ke liye permission chahiye. Permission Center me enable karo.`, latencyMs, raw);
  }
  if (/not available|not supported|no camera|not_supported|allow nahi/i.test(raw)) {
    return actionFail('NOT_SUPPORTED', action, target, `Ye phone ${target} action support nahi karta.`, latencyMs, raw);
  }
  if (/offline|unreachable|disconnected|no connection/i.test(raw)) {
    return actionFail('DEVICE_OFFLINE', action, target, 'Phone abhi connected nahi hai.', latencyMs, raw);
  }
  return actionFail('FAILED', action, target, `${target} me fail ho gaya.`, latencyMs, raw);
}

/** Map a verification outcome (launched but foreground mismatch) honestly. */
export function fromVerification(
  action: string,
  target: string,
  launched: boolean,
  verified: boolean,
  verifyReason: string | undefined,
  currentPackage: string | undefined,
  latencyMs: number,
): ActionResult {
  if (!launched) return actionFail('FAILED', action, target, `${target} launch hi nahi hua.`, latencyMs);
  if (verified) return actionOk(action, target, `${target} khul gaya.`, latencyMs);
  if (verifyReason === 'usage_permission_required') {
    return actionFail(
      'PERMISSION_REQUIRED', action, target,
      `${target} ko open karne bheja, par verify karne ke liye Usage Access permission chahiye.`, latencyMs, verifyReason,
    );
  }
  return actionFail(
    'VERIFICATION_FAILED', action, target,
    `Command bheja tha, par ${target} screen par dikha nahi${currentPackage ? ` (samne ${currentPackage} hai)` : ''}.`, latencyMs, verifyReason,
  );
}
