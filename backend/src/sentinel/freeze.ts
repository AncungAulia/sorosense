/**
 * Freeze-authorization path (U10). Turns a Sentinel anomaly into an on-chain `freeze(pool)` signed
 * by the keeper key. Protective ONLY — this path never calls allocate/deallocate/withdraw, so it can
 * never move funds (KTD3/KTD4). Idempotent: an already-frozen pool is a no-op; a transient submit
 * failure retries, then alerts rather than silently dropping.
 */

import type { PoolId, Signer, VaultClient } from '@sorosense/vault-client';

export type FreezeOutcome =
  | { status: 'frozen'; pool: PoolId; txHash: string }
  | { status: 'already-frozen'; pool: PoolId }
  | { status: 'failed'; pool: PoolId; error: string };

export interface FreezeDeps {
  vault: VaultClient;
  keeper: Signer;
  /** Retries on a transient submit failure before alerting. Default 2. */
  maxRetries?: number;
  /** Sink for an unrecoverable freeze failure (paging/logging). */
  onAlert?: (message: string) => void;
}

/**
 * Freeze a pool once, idempotently. Returns the outcome; the caller (allocator freeze-exit path)
 * surfaces it as an activity entry the frontend shows.
 */
export async function freezePool(pool: PoolId, deps: FreezeDeps): Promise<FreezeOutcome> {
  if (deps.keeper.role !== 'keeper') {
    // Guard: only the keeper may freeze. Never fall through to any fund-moving call.
    return { status: 'failed', pool, error: 'signer is not the keeper' };
  }

  // Idempotency — never double-freeze.
  if ((await deps.vault.poolStatus(pool)) === 'frozen') {
    return { status: 'already-frozen', pool };
  }

  const maxRetries = deps.maxRetries ?? 2;
  let lastErr = 'unknown error';
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const tx = deps.vault.freeze(pool); // freeze ONLY — no move/allocate anywhere in this path
      const res = await tx.signAndSubmit(deps.keeper);
      if (res.success) return { status: 'frozen', pool, txHash: res.hash };
      lastErr = `submit reported failure (${res.hash})`;
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }

  deps.onAlert?.(`freeze(${pool}) failed after ${maxRetries + 1} attempts: ${lastErr}`);
  return { status: 'failed', pool, error: lastErr };
}
