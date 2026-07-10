import { beforeEach, expect, test } from "vitest";
import { E2E_ADDRESS, E2E_WALLET_NAME, connect, disconnect, getAddress, signTransaction } from "../wallet-e2e";

beforeEach(async () => {
  await disconnect();
});

test("the address is a well-formed Stellar public key", () => {
  expect(E2E_ADDRESS).toMatch(/^G[A-Z2-7]{55}$/);
});

test("connect resolves a deterministic address and wallet name", async () => {
  expect(await connect()).toEqual({ address: E2E_ADDRESS, name: E2E_WALLET_NAME });
});

test("getAddress throws before connect and resolves after", async () => {
  await expect(getAddress()).rejects.toThrow("no e2e wallet connected");
  await connect();
  expect(await getAddress()).toBe(E2E_ADDRESS);
});

test("signTransaction marks the xdr rather than producing a real signature", async () => {
  await connect();
  expect(await signTransaction("mock-xdr-1")).toBe("e2e-signed:mock-xdr-1");
});

test("signTransaction refuses when disconnected", async () => {
  await expect(signTransaction("mock-xdr-1")).rejects.toThrow("no e2e wallet connected");
});
