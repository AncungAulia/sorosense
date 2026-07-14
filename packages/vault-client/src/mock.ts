/**
 * In-memory mock of {@link VaultClient} for parallel development before the real contract lands (U6).
 *
 * It models per-currency shares, per-currency NAV totals, a frozen-pool flag, and a pending
 * freeze-exit — enough for the backend, frontend, and e2e tracks to build against. Share math mirrors
 * the contract's virtual-offset accounting (`mint = amount·(totalShares+V)/(totalAssets+V)`), so the
 * first deposit is 1:1 and later deposits price against accrued NAV. Yield is not automatic; tests
 * inject it with {@link MockVaultClient.simulateYield}. Guards mirror the contract: a wrong-role
 * signer or a blocked flow (e.g. allocating into a frozen pool) throws, standing in for an on-chain panic.
 */

import type {
  Address,
  Amount,
  Currency,
  ExitProposal,
  PoolId,
  PoolStatus,
  PreparedTx,
  PriceRay,
  Shares,
  Signer,
  SignerRole,
  TxResult,
  VaultClient,
} from './interface';
import { SHARE_PRICE_SCALE } from './interface';

const bucketKey = (user: Address, currency: Currency): string => `${user}:${currency}`;

/** Equal virtual shares/assets offset — mirrors the contract, keeping the first deposit ~1:1. */
const VIRTUAL_OFFSET = 1n;

export class MockVaultClient implements VaultClient {
  private shares = new Map<string, Shares>();
  private consent = new Set<Address>();
  /** Depositors who turned auto-compound OFF. Absent = ON (default enabled). */
  private autoCompoundOff = new Set<Address>();
  private frozen = new Set<PoolId>();
  private active = new Map<Currency, PoolId>();
  private holdings = new Map<Currency, Amount>();
  private pending = new Map<Currency, ExitProposal>();
  /** Per-currency NAV accumulators backing share price. Separate from `holdings` (pool deployment). */
  private totalShares = new Map<Currency, Shares>();
  private totalAssets = new Map<Currency, Amount>();
  private seq = 0;
  /** When on, every submitted write comes back `success: false` with no effect. See simulateFailure. */
  private failSubmit = false;

  /** Shares minted for depositing `amount` into a bucket, per the contract's virtual-offset math. */
  private mintShares(currency: Currency, amount: Amount): Shares {
    const ts = this.totalShares.get(currency) ?? 0n;
    const ta = this.totalAssets.get(currency) ?? 0n;
    return (amount * (ts + VIRTUAL_OFFSET)) / (ta + VIRTUAL_OFFSET);
  }

  /** Assets returned for redeeming `shares` from a bucket, per the contract's virtual-offset math. */
  private redeemAssets(currency: Currency, shares: Shares): Amount {
    const ts = this.totalShares.get(currency) ?? 0n;
    const ta = this.totalAssets.get(currency) ?? 0n;
    return (shares * (ta + VIRTUAL_OFFSET)) / (ts + VIRTUAL_OFFSET);
  }

  /** Build a two-phase transaction whose effect runs only after a correct-role signature. */
  private prepare(requiredSigner: SignerRole, effect: () => void): PreparedTx {
    const xdr = `mock-xdr-${++this.seq}`;
    const submit = async (signer: Signer): Promise<TxResult> => {
      if (signer.role !== requiredSigner) {
        throw new Error(`wrong signer: need ${requiredSigner}, got ${signer.role}`);
      }
      await signer.sign(xdr);
      // A chain that rejects a *submitted* transaction reports `success: false` — it does not throw
      // (RealVaultClient.signAndSubmit). So the rejection lands after the signature and leaves state
      // untouched: no effect runs, exactly as an on-chain failure leaves the ledger unchanged.
      if (this.failSubmit) return { hash: `mock-tx-${this.seq}`, success: false };
      effect(); // throws on a blocked guard, mirroring a contract panic
      return { hash: `mock-tx-${this.seq}`, success: true };
    };
    return { xdr, requiredSigner, signAndSubmit: submit };
  }

  // ── Depositor-signed writes ──────────────────────────────────────────────
  deposit(depositor: Address, currency: Currency, amount: Amount): PreparedTx {
    return this.prepare('depositor', () => {
      if (amount <= 0n) throw new Error('deposit amount must be positive');
      const key = bucketKey(depositor, currency);
      // Mint against accrued NAV (1:1 for the first deposit; fewer shares after yield accrues).
      const minted = this.mintShares(currency, amount);
      // Above the base price a dust deposit rounds to zero shares; reject it rather
      // than take the funds for nothing — mirrors the contract's MintsNoShares (KTD10).
      if (minted <= 0n) throw new Error('deposit mints no shares (below one share at current price)');
      this.shares.set(key, (this.shares.get(key) ?? 0n) + minted);
      this.totalShares.set(currency, (this.totalShares.get(currency) ?? 0n) + minted);
      this.totalAssets.set(currency, (this.totalAssets.get(currency) ?? 0n) + amount);
    });
  }

  withdraw(depositor: Address, currency: Currency, shares: Shares): PreparedTx {
    return this.prepare('depositor', () => {
      const key = bucketKey(depositor, currency);
      const owned = this.shares.get(key) ?? 0n;
      if (shares <= 0n) throw new Error('withdraw shares must be positive');
      if (shares > owned) throw new Error('withdraw exceeds owned shares');
      // Redeem against NAV so share price stays consistent after the burn.
      const assets = this.redeemAssets(currency, shares);
      this.shares.set(key, owned - shares);
      this.totalShares.set(currency, (this.totalShares.get(currency) ?? 0n) - shares);
      this.totalAssets.set(currency, (this.totalAssets.get(currency) ?? 0n) - assets);
    });
  }

  setPolicyConsent(depositor: Address): PreparedTx {
    // Idempotent: re-signing is a no-op. No tier argument by design (KTD3).
    return this.prepare('depositor', () => {
      this.consent.add(depositor);
    });
  }

  setAutoCompound(depositor: Address, enabled: boolean): PreparedTx {
    // Economic preference, separate from consent (STE-38). Default is enabled, so we only track OFF.
    return this.prepare('depositor', () => {
      if (enabled) this.autoCompoundOff.delete(depositor);
      else this.autoCompoundOff.add(depositor);
    });
  }

  approveExit(depositor: Address, exitId: string): PreparedTx {
    return this.prepare('depositor', () => {
      const proposal = [...this.pending.values()].find((p) => p.id === exitId);
      if (!proposal) throw new Error(`no pending exit ${exitId}`);
      // Move the bucket's active pool from the frozen pool to the safe target, then clear the proposal.
      this.active.set(proposal.currency, proposal.toPool);
      this.pending.delete(proposal.currency);
    });
  }

  // ── Keeper / agent writes ────────────────────────────────────────────────
  allocate(pool: PoolId, currency: Currency, amount: Amount): PreparedTx {
    return this.prepare('keeper', () => {
      if (this.frozen.has(pool)) throw new Error(`pool ${pool} is frozen`);
      if (amount <= 0n) throw new Error('allocate amount must be positive');
      this.active.set(currency, pool);
      this.holdings.set(currency, (this.holdings.get(currency) ?? 0n) + amount);
    });
  }

  deallocate(pool: PoolId, currency: Currency, amount: Amount): PreparedTx {
    return this.prepare('keeper', () => {
      const held = this.holdings.get(currency) ?? 0n;
      if (amount > held) throw new Error('deallocate exceeds holdings');
      this.holdings.set(currency, held - amount);
    });
  }

  freeze(pool: PoolId): PreparedTx {
    // Protective only — never moves funds (KTD4). Idempotent.
    return this.prepare('keeper', () => {
      this.frozen.add(pool);
    });
  }

  unfreeze(pool: PoolId): PreparedTx {
    return this.prepare('keeper', () => {
      this.frozen.delete(pool);
    });
  }

  proposeExit(currency: Currency, fromPool: PoolId, toPool: PoolId): PreparedTx {
    return this.prepare('keeper', () => {
      const proposal: ExitProposal = { id: `exit-${++this.seq}`, currency, fromPool, toPool };
      this.pending.set(currency, proposal);
    });
  }

  // ── Reads ────────────────────────────────────────────────────────────────
  async balanceOf(user: Address, currency: Currency): Promise<Shares> {
    return this.shares.get(bucketKey(user, currency)) ?? 0n;
  }

  async sharePrice(currency: Currency): Promise<PriceRay> {
    const ts = this.totalShares.get(currency) ?? 0n;
    const ta = this.totalAssets.get(currency) ?? 0n;
    // Base price (SHARE_PRICE_SCALE) for an empty/fresh bucket; rises as NAV accrues.
    return ((ta + VIRTUAL_OFFSET) * SHARE_PRICE_SCALE) / (ts + VIRTUAL_OFFSET);
  }

  async assetValueOf(user: Address, currency: Currency): Promise<Amount> {
    // Computed directly from NAV (not via sharePrice) to avoid double-truncation.
    return this.redeemAssets(currency, this.shares.get(bucketKey(user, currency)) ?? 0n);
  }

  async poolStatus(pool: PoolId): Promise<PoolStatus> {
    return this.frozen.has(pool) ? 'frozen' : 'active';
  }

  async hasConsent(depositor: Address): Promise<boolean> {
    return this.consent.has(depositor);
  }

  async autoCompoundEnabled(depositor: Address): Promise<boolean> {
    return !this.autoCompoundOff.has(depositor); // default enabled
  }

  async activePool(currency: Currency): Promise<PoolId | null> {
    return this.active.get(currency) ?? null;
  }

  async pendingExit(currency: Currency): Promise<ExitProposal | null> {
    return this.pending.get(currency) ?? null;
  }

  // ── Test-only hooks (NOT part of VaultClient) ─────────────────────────────
  /**
   * Raise a bucket's NAV by `amount` without minting shares — the same lift the vault now computes on
   * chain as a `yield_pool`'s `balance(vault)` grows with ledger time (mark-to-market NAV, contract
   * binver 1.3.0). The mock keeps NAV in `totalAssets` directly rather than summing pool balances, so
   * this hook is how a test advances the clock's effect. Not a vault operation; test-only.
   */
  simulateYield(currency: Currency, amount: Amount): void {
    if (amount < 0n) throw new Error('simulateYield amount must be non-negative');
    this.totalAssets.set(currency, (this.totalAssets.get(currency) ?? 0n) + amount);
  }

  /**
   * Make every subsequent write submit-but-fail: `signAndSubmit` resolves `{ hash, success: false }`
   * and applies no effect. Test-only, and explicitly outside {@link VaultClient} — a caller cannot
   * reach it through the seam type.
   *
   * It exists because the honest failure a live vault produces is a *resolved* promise carrying
   * `success: false` (a rejected transaction is not an exception), and a mock that always reports
   * success cannot prove any surface guards it. Every write surface's rejection test drives this hook
   * instead of hand-patching a fake `signAndSubmit` onto the client (KTD4).
   */
  simulateFailure(enabled = true): void {
    this.failSubmit = enabled;
  }
}

/** A test/dev signer that authorizes any XDR for its role. */
export function mockSigner(role: SignerRole, address: Address = `${role}-addr`): Signer {
  return { role, address, sign: async (xdr: string) => `sig(${address}):${xdr}` };
}
