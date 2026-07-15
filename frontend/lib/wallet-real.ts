import { StellarWalletsKit, Networks } from "@creit.tech/stellar-wallets-kit";
import { FREIGHTER_ID } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import {
  WalletConnectModule,
  WalletConnectTargetChain,
} from "@creit.tech/stellar-wallets-kit/modules/wallet-connect";
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";
import { UniversalProvider } from "@walletconnect/universal-provider";
import { createAppKit, type AppKit } from "@reown/appkit/core";
import { mainnet } from "@reown/appkit/networks";
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

const WALLET_ID_KEY = "soro.wallet.id";
const FREIGHTER_WC_ID = "997a355c8f682468706a76cff1b004a7115f505fb962dac54b6e9b442dd1c380";
const WC_TESTNET = "stellar:testnet";

type StellarWindow = Window & typeof globalThis & { stellar?: { provider?: string; platform?: string } };
type WcProvider = Awaited<ReturnType<typeof UniversalProvider.init>>;

let mobileWc:
  | {
      provider: WcProvider;
      modal: AppKit;
      address?: string;
    }
  | null = null;

class SoroWalletConnectModule extends WalletConnectModule {
  async isPlatformWrapper(): Promise<boolean> {
    return false;
  }
}

function walletModules() {
  const modules = defaultModules();
  const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID;
  if (!projectId) return modules;
  return [
    ...modules,
    new SoroWalletConnectModule({
      projectId,
      allowedChains: [WalletConnectTargetChain.TESTNET],
      metadata: {
        name: "SoroSense",
        description: "Stablecoin yield on Stellar",
        url: typeof window === "undefined" ? "https://sorosense.app" : window.location.origin,
        icons: typeof window === "undefined" ? [] : [`${window.location.origin}/favicon.ico`],
      },
    }),
  ];
}

function isFreighterMobile() {
  const stellar = (window as StellarWindow).stellar;
  return stellar?.provider === "freighter" && stellar?.platform === "mobile";
}

function walletConnectProjectId() {
  return process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ?? "";
}

async function getMobileWalletConnect() {
  if (mobileWc) return mobileWc;
  const projectId = walletConnectProjectId();
  if (!projectId) {
    throw new Error("WalletConnect project ID is not configured.");
  }
  const provider = await UniversalProvider.init({
    projectId,
    metadata: {
      name: "SoroSense",
      description: "Stablecoin yield on Stellar",
      url: window.location.origin,
      icons: [`${window.location.origin}/favicon.ico`],
    },
  });
  const modal = createAppKit({
    projectId,
    networks: [mainnet],
    universalProvider: provider as unknown as Parameters<typeof createAppKit>[0]["universalProvider"],
    manualWCControl: true,
    enableReconnect: true,
    featuredWalletIds: [FREIGHTER_WC_ID],
  });
  provider.on("display_uri", (uri: string) => {
    modal.open({ uri });
  });
  provider.on("session_delete", () => {
    mobileWc = null;
  });
  mobileWc = { provider, modal };
  return mobileWc;
}

async function connectMobileWalletConnect(): Promise<{ address: string; name: string }> {
  const wc = await getMobileWalletConnect();
  try {
    const session = await wc.provider.connect({
      namespaces: {
        stellar: {
          methods: ["stellar_signXDR", "stellar_signAndSubmitXDR", "stellar_signMessage", "stellar_signAuthEntry"],
          chains: [WC_TESTNET],
          events: ["accountsChanged"],
        },
      },
    });
    wc.modal.close();
    if (!session) throw new Error("Connection cancelled.");
    const address = session.namespaces.stellar?.accounts[0]?.split(":")[2];
    if (!address) throw new Error("Freighter did not return an account.");
    wc.address = address;
    return { address, name: "Freighter" };
  } catch (e) {
    wc.modal.close();
    throw e;
  }
}

async function mobileWalletConnectAddress() {
  const wc = await getMobileWalletConnect();
  if (wc.address) return wc.address;
  const account = wc.provider.session?.namespaces.stellar?.accounts[0]?.split(":")[2];
  if (!account) throw new Error("No WalletConnect session found.");
  wc.address = account;
  return account;
}

async function mobileWalletConnectRequest<T>(method: string, params: Record<string, string>): Promise<T> {
  const wc = await getMobileWalletConnect();
  if (!wc.provider.session) throw new Error("No WalletConnect session found.");
  return wc.provider.request<T>({
    method,
    params,
  }, WC_TESTNET);
}

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
      selectedWalletId: initialWalletId(),
      modules: walletModules(), // xBull / Lobstr / Albedo / WalletConnect / ... fallback
    });
    initialized = true;
  }
  return StellarWalletsKit;
}

function initialWalletId() {
  const saved = safeLocalStorageGet(WALLET_ID_KEY);
  if (saved) return saved;
  return FREIGHTER_ID;
}

function safeLocalStorageGet(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
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

export function getWalletId(): string {
  if (typeof window !== "undefined" && isFreighterMobile() && walletConnectProjectId()) return "wallet_connect";
  return getKit().selectedModule.productId;
}

export async function connect(): Promise<{ address: string; name: string }> {
  try {
    if (isFreighterMobile() && walletConnectProjectId()) {
      return await connectMobileWalletConnect();
    }
    const { address } = await getKit().authModal();
    return { address, name: getWalletName() };
  } catch (e) {
    throw toWalletError(e);
  }
}

export async function getAddress(): Promise<string> {
  if (isFreighterMobile() && walletConnectProjectId()) {
    return mobileWalletConnectAddress();
  }
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
      if (isFreighterMobile() && walletConnectProjectId()) {
        const { signature } = await mobileWalletConnectRequest<{ signature: string }>("stellar_signMessage", {
          message: xdr,
        });
        return signature;
      }
      // Sign on the WALLET'S current network. The kit defaults signMessage to the network passed
      // to init() (Test Net), so Freighter refuses when the wallet is on another network ("expects
      // Test Net" while set to Main Net). The mock discards the signature, so any network is fine —
      // reading the wallet's active networkPassphrase and matching it avoids the mismatch entirely.
      const { networkPassphrase } = await getKit().getNetwork();
      const { signedMessage } = await getKit().signMessage(xdr, { networkPassphrase });
      return signedMessage;
    }
    if (isFreighterMobile() && walletConnectProjectId()) {
      const { signedXDR } = await mobileWalletConnectRequest<{ signedXDR: string }>("stellar_signXDR", { xdr });
      return signedXDR;
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
  if (isFreighterMobile() && walletConnectProjectId()) {
    if (mobileWc?.provider.session) await mobileWc.provider.disconnect();
    mobileWc = null;
    initialized = false;
    return;
  }
  await getKit().disconnect();
  initialized = false;
}
