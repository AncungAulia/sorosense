/**
 * In-memory mock of {@link VaultClient} for parallel development before the real contract lands (U6).
 *
 * It models per-currency shares, a frozen-pool flag, and a pending freeze-exit — enough for the
 * backend, frontend, and e2e tracks to build against. Share math is intentionally simple (1:1 mint,
 * no yield accrual); the real contract owns NAV accounting. Guards mirror the contract: a wrong-role
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
  Shares,
  Signer,
  SignerRole,
  TxResult,
  VaultClient,
} from './interface.js';

const bucketKey = (user: Address, currency: Currency): string => `${user}:${currency}`;

export class MockVaultClient implements VaultClient {
  private shares = new Map<string, Shares>();
  private consent = new Set<Address>();
  private frozen = new Set<PoolId>();
  private active = new Map<Currency, PoolId>();
  private holdings = new Map<Currency, Amount>();
  private pending = new Map<Currency, ExitProposal>();
  private seq = 0;

  /** Build a two-phase transaction whose effect runs only after a correct-role signature. */
  private prepare(requiredSigner: SignerRole, effect: () => void): PreparedTx {
    const xdr = `mock-xdr-${++this.seq}`;
    const submit = async (signer: Signer): Promise<TxResult> => {
      if (signer.role !== requiredSigner) {
        throw new Error(`wrong signer: need ${requiredSigner}, got ${signer.role}`);
      }
      await signer.sign(xdr);
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
      // Mock mints shares 1:1 with the deposited amount (no yield modeled).
      this.shares.set(key, (this.shares.get(key) ?? 0n) + amount);
    });
  }

  withdraw(depositor: Address, currency: Currency, shares: Shares): PreparedTx {
    return this.prepare('depositor', () => {
      const key = bucketKey(depositor, currency);
      const owned = this.shares.get(key) ?? 0n;
      if (shares <= 0n) throw new Error('withdraw shares must be positive');
      if (shares > owned) throw new Error('withdraw exceeds owned shares');
      this.shares.set(key, owned - shares);
    });
  }

  setPolicyConsent(depositor: Address): PreparedTx {
    // Idempotent: re-signing is a no-op. No tier argument by design (KTD3).
    return this.prepare('depositor', () => {
      this.consent.add(depositor);
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

  async poolStatus(pool: PoolId): Promise<PoolStatus> {
    return this.frozen.has(pool) ? 'frozen' : 'active';
  }

  async hasConsent(depositor: Address): Promise<boolean> {
    return this.consent.has(depositor);
  }

  async activePool(currency: Currency): Promise<PoolId | null> {
    return this.active.get(currency) ?? null;
  }

  async pendingExit(currency: Currency): Promise<ExitProposal | null> {
    return this.pending.get(currency) ?? null;
  }
}

/** A test/dev signer that authorizes any XDR for its role. */
export function mockSigner(role: SignerRole, address: Address = `${role}-addr`): Signer {
  return { role, address, sign: async (xdr: string) => `sig(${address}):${xdr}` };
}
