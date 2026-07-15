/**
 * The `changeTrust` half of the faucet's recovery path (R6).
 *
 * The backend's faucet mints a **SAC** — the Stellar Asset Contract wrapping a self-issued *classic*
 * asset (STE-46) — so the recipient still needs the classic trustline before any mint can land. That is
 * what its `409 { needsChangeTrust, sac }` means. The 409 carries the SAC contract id, but a
 * `changeTrust` operation is keyed by the asset's **code + issuer**, which is why the issuer accounts
 * come from `NEXT_PUBLIC_USDC_ISSUER` / `NEXT_PUBLIC_EURC_ISSUER` (public keys — safe in the browser;
 * the issuer *secret* never leaves the backend).
 *
 * The XDR is a **real** transaction, so `lib/wallet.ts` `signTransaction` takes its real signing branch
 * — not the `mock-xdr-*` message branch the MockVaultClient's placeholder envelopes take. Both branches
 * already exist and are correct; do not "fix" that ternary.
 */

import { Asset, BASE_FEE, Horizon, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import type { StablecoinSym } from "../vault/data";
import { assetFor, horizonUrl } from "./balance";

/**
 * Build → wallet-sign → submit a `changeTrust` for the stablecoin's classic asset. Resolves with the
 * submitted transaction hash (public), throws if the user declines the signature or Horizon rejects it —
 * the caller (`FaucetButton`) turns either into a toast and does **not** retry the mint.
 *
 * The limit is left at the protocol default (max): the user is adding a trustline to receive test funds,
 * and a bespoke cap would be a second thing to explain for no benefit.
 *
 * TESTNET by construction: the faucet route only exists on a testnet backend (env-gated, inert on
 * mainnet), so a `changeTrust` reached from a 409 is always a testnet transaction — the same network the
 * wallet kit is initialized with (`lib/wallet-real.ts`).
 */
export async function addTrustline(
  sym: StablecoinSym,
  address: string,
  signTransaction: (xdr: string) => Promise<string>,
): Promise<string> {
  const asset = assetFor(sym);
  if (!asset) {
    throw new Error(`no issuer configured for ${sym}. Cannot build a trustline`);
  }

  const server = new Horizon.Server(horizonUrl());
  const account = await server.loadAccount(address);

  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.changeTrust({ asset: new Asset(asset.code, asset.issuer) }))
    .setTimeout(180)
    .build();

  const signedXdr = await signTransaction(transaction.toXDR());
  const submitted = await server.submitTransaction(
    TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET),
  );
  return submitted.hash;
}
