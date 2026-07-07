import type { Signer } from "@sorosense/vault-client";

/** Bridge the wallet's XDR signer (U13) to the vault seam's depositor Signer. */
export function depositorSigner(
  address: string,
  signTransaction: (xdr: string) => Promise<string>,
): Signer {
  return { role: "depositor", address, sign: (xdr) => signTransaction(xdr) };
}
