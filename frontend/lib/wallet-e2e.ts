/**
 * The wallet layer Playwright drives. Freighter is a browser extension: automating its popup would
 * mean loading an unpacked extension and a seed phrase into the test browser. Instead `lib/wallet.ts`
 * swaps this module in when NEXT_PUBLIC_E2E === "1", so the app under test signs without a popup.
 *
 * `signTransaction` returns a marker, not a signature. Nothing verifies it: `MockVaultClient` calls
 * `signer.sign(xdr)` and discards the result. When the real bindings land (U20) this module is not
 * part of that path — the dispatcher simply never selects it outside an e2e run.
 */

/** A well-formed Stellar public key. Deterministic, so specs can assert on the Account chip. */
export const E2E_ADDRESS = "GA6HCMBLTZS5VYYBCATRBRZ3BZJMAFUDKYYF6AH6MVCMGWMRDNSWJPIH";

/** The app persists the product name captured at connect time; the stub stands in for Freighter. */
export const E2E_WALLET_NAME = "Freighter";

let connected = false;

function requireConnected(): void {
  if (!connected) throw new Error("no e2e wallet connected");
}

export async function connect(): Promise<{ address: string; name: string }> {
  connected = true;
  return { address: E2E_ADDRESS, name: E2E_WALLET_NAME };
}

export async function getAddress(): Promise<string> {
  requireConnected();
  return E2E_ADDRESS;
}

export async function signTransaction(xdr: string): Promise<string> {
  requireConnected();
  return `e2e-signed:${xdr}`;
}

export async function disconnect(): Promise<void> {
  connected = false;
}
