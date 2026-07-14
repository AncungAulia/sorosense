/**
 * The real faucet minter (STE-21 Fase B, U4). Signs a SAC `mint(to, amount)` with the issuer secret and
 * submits it to soroban RPC. This is the ONE place `FAUCET_ISSUER_SECRET` is used; it never leaves the
 * backend and never appears in a response. Exercised by the live smoke (U6), not CI — the route logic
 * (`faucet.ts`) is unit-tested with a fake minter instead.
 */

import {
  rpc,
  Contract,
  Keypair,
  TransactionBuilder,
  Address,
  nativeToScVal,
  BASE_FEE,
} from '@stellar/stellar-sdk';

import type { FaucetMinter, MintResult } from './faucet.js';

export interface FaucetMinterOptions {
  issuerSecret: string;
  rpcUrl: string;
  networkPassphrase: string;
}

/** Build a minter that invokes `mint` on a wrapped-asset SAC as its issuer/admin. */
export function makeFaucetMinter(opts: FaucetMinterOptions): FaucetMinter {
  const issuer = Keypair.fromSecret(opts.issuerSecret);
  const server = new rpc.Server(opts.rpcUrl);

  return {
    async mint(sac: string, to: string, amount: bigint): Promise<MintResult> {
      const source = await server.getAccount(issuer.publicKey());
      const op = new Contract(sac).call(
        'mint',
        Address.fromString(to).toScVal(),
        nativeToScVal(amount, { type: 'i128' }),
      );
      const built = new TransactionBuilder(source, {
        fee: BASE_FEE,
        networkPassphrase: opts.networkPassphrase,
      })
        .addOperation(op)
        .setTimeout(30)
        .build();

      const sim = await server.simulateTransaction(built);
      if (rpc.Api.isSimulationError(sim)) {
        // A recipient without a trustline can't receive the SAC — surface it so the caller returns a
        // changeTrust hint rather than a 500.
        if (/trust|not.?authorized/i.test(sim.error)) return { ok: false, reason: 'no-trustline' };
        throw new Error(`faucet mint simulation failed: ${sim.error}`);
      }

      const prepared = rpc.assembleTransaction(built, sim).build();
      prepared.sign(issuer);
      const sent = await server.sendTransaction(prepared);
      if (sent.status === 'ERROR') {
        throw new Error(`faucet mint submit failed: ${JSON.stringify(sent.errorResult)}`);
      }

      // Poll briefly for confirmation; the hash is stable regardless of the poll outcome.
      for (let i = 0; i < 10; i++) {
        const got = await server.getTransaction(sent.hash);
        if (got.status === 'SUCCESS') break;
        if (got.status === 'FAILED') throw new Error(`faucet mint failed on-chain: ${sent.hash}`);
        await new Promise((r) => setTimeout(r, 1000));
      }
      return { ok: true, hash: sent.hash };
    },
  };
}
