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

// Real Freighter keeps its connection in the extension, alive across page reloads. This stub must
// mirror that: a module-scope flag would reset on every hard load, so getAddress() verification
// (WalletProvider hydration, STE-43) would false-negative and bounce every e2e deep load. Persist
// the connection in localStorage instead. Client-only, like the real wallet.
const CONNECTED_KEY = "soro.e2e.connected";

function isConnected(): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem(CONNECTED_KEY) === "1";
}

function requireConnected(): void {
  if (!isConnected()) throw new Error("no e2e wallet connected");
}

export async function connect(): Promise<{ address: string; name: string }> {
  if (typeof window !== "undefined") window.localStorage.setItem(CONNECTED_KEY, "1");
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
  if (typeof window !== "undefined") window.localStorage.removeItem(CONNECTED_KEY);
}
