import { afterEach, expect, test, vi } from "vitest";

// NOTE: the plan's expected shape (constructor `new StellarWalletsKit(...)`,
// instance `openModal({ onWalletSelected })`) does not match the installed
// @creit.tech/stellar-wallets-kit@2.5.0 API. In 2.5.0, `StellarWalletsKit` is
// a *static* class (`StellarWalletsKit.init(...)`, `StellarWalletsKit.authModal()`,
// etc.) — there is no constructor and no `openModal`/`onWalletSelected` callback.
// `authModal()` opens the wallet-picker UI, sets the chosen wallet active, and
// resolves `{ address }` directly. The mocks below reflect the real API.
const init = vi.fn();
const authModal = vi.fn(async () => ({ address: "GABC123" }));
const getAddress = vi.fn(async () => ({ address: "GABC123" }));
const signTransaction = vi.fn(async () => ({ signedTxXdr: "signed-xdr" }));
const disconnect = vi.fn(async () => undefined);

vi.mock("@creit.tech/stellar-wallets-kit", () => ({
  StellarWalletsKit: { init, authModal, getAddress, signTransaction, disconnect },
  Networks: { TESTNET: "TESTNET" },
}));

vi.mock("@creit.tech/stellar-wallets-kit/modules/freighter", () => ({
  FREIGHTER_ID: "freighter",
}));

vi.mock("@creit.tech/stellar-wallets-kit/modules/utils", () => ({
  defaultModules: () => [],
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

test("connect() returns the selected wallet address", async () => {
  const { connect } = await import("../wallet");
  await expect(connect()).resolves.toBe("GABC123");
  expect(init).toHaveBeenCalledWith(
    expect.objectContaining({ selectedWalletId: "freighter", network: "TESTNET" })
  );
  expect(authModal).toHaveBeenCalled();
});

test("getAddress() returns the active address", async () => {
  const { getAddress: getAddr } = await import("../wallet");
  await expect(getAddr()).resolves.toBe("GABC123");
});

test("signTransaction() returns the signed XDR", async () => {
  const { signTransaction: sign } = await import("../wallet");
  await expect(sign("raw-xdr")).resolves.toBe("signed-xdr");
});

test("disconnect() clears the wallet session", async () => {
  const { disconnect: dc } = await import("../wallet");
  await expect(dc()).resolves.toBeUndefined();
  expect(disconnect).toHaveBeenCalled();
});

test("disconnect() resets the lazy-init guard so the next connect() re-initializes", async () => {
  const { connect, disconnect: dc } = await import("../wallet");
  await connect();
  await dc();
  await connect();
  expect(init).toHaveBeenCalledTimes(2);
});

test("getKit() throws outside the browser", async () => {
  const originalWindow = globalThis.window;
  // @ts-expect-error simulating server environment
  delete globalThis.window;
  try {
    const { getKit } = await import("../wallet");
    expect(() => getKit()).toThrow(/client-only/i);
  } finally {
    globalThis.window = originalWindow;
  }
});
