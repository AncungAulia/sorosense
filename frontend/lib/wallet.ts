import * as e2e from "./wallet-e2e";
import * as real from "./wallet-real";

export { WalletError, USER_CLOSED_MODAL } from "./wallet-error";

/**
 * Next inlines NEXT_PUBLIC_* at build time, so in a production build this reads `"" === "1"` and every
 * e2e branch below is dead. `wallet-e2e.ts` still travels in the bundle — the ternaries reference it —
 * but it is ~30 lines, holds no key material, and is unreachable. Excluding it outright would need a
 * webpack alias; that config surface costs more than it buys. See the U17 design doc.
 */
const E2E = process.env.NEXT_PUBLIC_E2E === "1";

export const connect = E2E ? e2e.connect : real.connect;
export const getAddress = E2E ? e2e.getAddress : real.getAddress;
export const getWalletId = E2E ? (() => "e2e") : real.getWalletId;
export const signTransaction = E2E ? e2e.signTransaction : real.signTransaction;
export const disconnect = E2E ? e2e.disconnect : real.disconnect;
