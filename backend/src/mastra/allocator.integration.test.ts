/**
 * E2E integration — the allocator's compound gating wired against the REAL MockVaultClient seam.
 * A depositor toggles auto-compound OFF via `setAutoCompound`; the keeper reads the real
 * `autoCompoundEnabled` seam and skips compound for them while still compounding an ON depositor and
 * still rebalancing regardless. Proves the whole chain (seam toggle → keeper honors it) end-to-end.
 */

import { describe, expect, it, vi } from 'vitest';
import { MockVaultClient, mockSigner, type Address } from '@sorosense/vault-client';

import {
  InMemoryBucketStore,
  runAllocatorTick,
  type AllocatorEffects,
  type Candidate,
} from './allocator.js';

const alice = mockSigner('depositor', 'alice');
const bob = mockSigner('depositor', 'bob');
const spyEffects = () => {
  const compound = vi.fn(async () => {});
  const rebalance = vi.fn(async () => {});
  const freezeExit = vi.fn(async () => {});
  return { compound, rebalance, freezeExit } satisfies AllocatorEffects;
};
const safeSet: Candidate[] = [
  { poolId: 'blend-usdc', ray: 6.2 },
  { poolId: 'defindex-usdc', ray: 8.1 },
];

describe('allocator ↔ seam auto-compound e2e', () => {
  it('keeper compounds the ON depositor and skips the OFF one, reading the real seam', async () => {
    const vault = new MockVaultClient();
    await vault.setAutoCompound('alice', false).signAndSubmit(alice); // alice OFF; bob stays default ON

    const store = new InMemoryBucketStore();
    store.setActivePool('USD', 'defindex-usdc'); // best pool active → decision is compound
    const effects = spyEffects();

    const d = await runAllocatorTick({
      currency: 'USD',
      activeAnomaly: false,
      activeRay: 8.1,
      candidates: safeSet,
      yieldAccrued: true,
      thresholdPct: 0.5,
      store,
      effects,
      depositors: ['alice', 'bob'],
      autoCompoundEnabled: (dep: Address) => vault.autoCompoundEnabled(dep), // REAL seam read
    });

    expect(d.kind).toBe('compound');
    expect(effects.compound).toHaveBeenCalledOnce();
    expect(effects.compound).toHaveBeenCalledWith('USD', 'defindex-usdc', 'bob'); // ON
    expect(effects.compound).not.toHaveBeenCalledWith('USD', 'defindex-usdc', 'alice'); // OFF skipped
  });

  it('toggling auto-compound never touches the safety mandate', async () => {
    const vault = new MockVaultClient();
    await vault.setPolicyConsent('alice').signAndSubmit(alice);
    await vault.setAutoCompound('alice', false).signAndSubmit(alice);
    expect(await vault.hasConsent('alice')).toBe(true); // consent survives
    expect(await vault.autoCompoundEnabled('alice')).toBe(false);
  });

  it('rebalance still fires for an OFF depositor (allocate/rebalance unaffected)', async () => {
    const vault = new MockVaultClient();
    await vault.setAutoCompound('alice', false).signAndSubmit(alice);

    const store = new InMemoryBucketStore();
    store.setActivePool('USD', 'blend-usdc'); // defindex (8.1) beats 6.2 → rebalance
    const effects = spyEffects();

    const d = await runAllocatorTick({
      currency: 'USD',
      activeAnomaly: false,
      activeRay: 6.2,
      candidates: safeSet,
      yieldAccrued: false,
      thresholdPct: 0.5,
      store,
      effects,
      depositors: ['alice'],
      autoCompoundEnabled: (dep: Address) => vault.autoCompoundEnabled(dep),
    });

    expect(d.kind).toBe('rebalance');
    expect(effects.rebalance).toHaveBeenCalledOnce();
    expect(effects.compound).not.toHaveBeenCalled();
  });
});
