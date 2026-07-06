import { StellarWalletsKit, Networks } from "@creit.tech/stellar-wallets-kit";
import { FREIGHTER_ID } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";

// NOTE: @creit.tech/stellar-wallets-kit@2.5.0 ships `StellarWalletsKit` as a
// *static* class (no constructor, no instances) — `init()`, `getAddress()`,
// `signTransaction()`, `disconnect()`, and `authModal()` are all static
// methods. There is no `openModal({ onWalletSelected })`; `authModal()` opens
// the wallet-picker UI, sets the chosen wallet as active, and resolves the
// connected address directly. `FREIGHTER_ID` and the "allow all wallets"
// helper (`defaultModules`) live under package subpaths, not the root export.
//
// `initialized` plays the role the plan's `let kit = null` singleton guard
// would have played for an instantiable kit: init() is only ever called once,
// lazily, and only in the browser (KTD7).
let initialized = false;

export function getKit(): typeof StellarWalletsKit {
  if (typeof window === "undefined") {
    throw new Error("wallet is client-only");
  }
  if (!initialized) {
    StellarWalletsKit.init({
      network: Networks.TESTNET,
      selectedWalletId: FREIGHTER_ID, // Freighter-first
      modules: defaultModules(), // xBull / Lobstr / Albedo / ... fallback
    });
    initialized = true;
  }
  return StellarWalletsKit;
}

export async function connect(): Promise<string> {
  const { address } = await getKit().authModal();
  return address;
}

export async function getAddress(): Promise<string> {
  const { address } = await getKit().getAddress();
  return address;
}

export async function signTransaction(xdr: string): Promise<string> {
  const { signedTxXdr } = await getKit().signTransaction(xdr, {
    networkPassphrase: Networks.TESTNET,
  });
  return signedTxXdr;
}

export async function disconnect(): Promise<void> {
  await getKit().disconnect();
  initialized = false;
}
