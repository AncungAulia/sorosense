import { StellarWalletsKit, Networks } from "@creit.tech/stellar-wallets-kit";
import { FREIGHTER_ID } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";
import { toWalletError } from "./wallet-error";

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
    // KNOWN LIMITATION: the selected wallet id is NOT persisted across
    // reloads, so after a refresh the kit always re-initializes with
    // Freighter pre-selected. If a user connected via a non-Freighter
    // fallback (xBull/Lobstr/...), a post-refresh signTransaction() would
    // target Freighter unless the app re-runs authModal()/setWallet() first.
    // Task 10 works around the *display* half of this (see getWalletName()
    // below) by persisting the product name captured at connect time — it
    // does NOT persist the selected wallet id itself, so the signing-target
    // mismatch above is still open.
    StellarWalletsKit.init({
      network: Networks.TESTNET,
      selectedWalletId: FREIGHTER_ID, // Freighter-first
      modules: defaultModules(), // xBull / Lobstr / Albedo / ... fallback
    });
    initialized = true;
  }
  return StellarWalletsKit;
}

// The kit tracks which wallet module (Freighter/xBull/Lobstr/...) is currently active as a
// *static* getter, `StellarWalletsKit.selectedModule: ModuleInterface`, which carries a
// `productName` meant for display (e.g. "Freighter", "xBull"). This is only truthful right
// after authModal()/setWallet() has run — see the KNOWN LIMITATION note on getKit() above:
// a page reload always re-initializes with Freighter pre-selected regardless of which wallet
// the user actually connected with last. Callers must capture this value at connect time and
// persist it themselves; do not call getWalletName() to "refresh" the name on hydration.
export function getWalletName(): string {
  return getKit().selectedModule.productName;
}

export async function connect(): Promise<{ address: string; name: string }> {
  try {
    const { address } = await getKit().authModal();
    return { address, name: getWalletName() };
  } catch (e) {
    throw toWalletError(e);
  }
}

export async function getAddress(): Promise<string> {
  const { address } = await getKit().getAddress();
  return address;
}

export async function signTransaction(xdr: string): Promise<string> {
  try {
    // MockVaultClient emits placeholder XDRs ("mock-xdr-N") that are NOT real Stellar
    // transactions, so a wallet rejects them (Freighter throws an internal error). Until the
    // real contract bindings land (U20), sign these as an arbitrary message instead — the wallet
    // still pops and signs, and the mock ignores the returned signature. This keeps every signed
    // flow (deposit/withdraw/consent/approve-exit) demoable end-to-end against a real wallet.
    // Real transaction XDRs fall through to signTransaction below, so the swap is automatic at U20.
    if (xdr.startsWith("mock-xdr-")) {
      // Sign on the WALLET'S current network. The kit defaults signMessage to the network passed
      // to init() (Test Net), so Freighter refuses when the wallet is on another network ("expects
      // Test Net" while set to Main Net). The mock discards the signature, so any network is fine —
      // reading the wallet's active networkPassphrase and matching it avoids the mismatch entirely.
      const { networkPassphrase } = await getKit().getNetwork();
      const { signedMessage } = await getKit().signMessage(xdr, { networkPassphrase });
      return signedMessage;
    }
    const { signedTxXdr } = await getKit().signTransaction(xdr, {
      networkPassphrase: Networks.TESTNET,
    });
    return signedTxXdr;
  } catch (e) {
    throw toWalletError(e);
  }
}

export async function disconnect(): Promise<void> {
  await getKit().disconnect();
  initialized = false;
}
