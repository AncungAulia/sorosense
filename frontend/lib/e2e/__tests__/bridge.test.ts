import { beforeEach, expect, test } from "vitest";
import { MockVaultClient, mockSigner } from "@sorosense/vault-client";
import { SEED_POOLS, SEED_SAFE_EXIT } from "../../vault/seed";
import { createKeeperBridge } from "../bridge";

const USER = "GTESTUSER";
let client: MockVaultClient;
let bumps: number;

beforeEach(() => {
  client = new MockVaultClient();
  bumps = 0;
});

const bridge = () => createKeeperBridge(client, () => void bumps++);

test("allocate sets the bucket's active pool and bumps", async () => {
  await bridge().allocate("EUR", "500");
  expect(await client.activePool("EUR")).toBe(SEED_POOLS.EUR);
  expect(bumps).toBe(1);
});

test("compound raises the bucket's value without minting shares", async () => {
  await client.deposit(USER, "EUR", 500_0000000n).signAndSubmit(mockSigner("depositor", USER));
  const before = await client.assetValueOf(USER, "EUR");
  const shares = await client.balanceOf(USER, "EUR");

  await bridge().compound("EUR", "10");

  expect(await client.assetValueOf(USER, "EUR")).toBeGreaterThan(before);
  expect(await client.balanceOf(USER, "EUR")).toBe(shares);
  expect(bumps).toBe(1);
});

test("freeze pauses the active pool", async () => {
  const k = bridge();
  await k.allocate("EUR", "500");
  await k.freeze("EUR");
  expect(await client.poolStatus(SEED_POOLS.EUR)).toBe("frozen");
});

test("proposeExit targets the bucket's safe pool", async () => {
  const k = bridge();
  await k.allocate("EUR", "500");
  await k.freeze("EUR");
  await k.proposeExit("EUR");

  const proposal = await client.pendingExit("EUR");
  expect(proposal?.fromPool).toBe(SEED_POOLS.EUR);
  expect(proposal?.toPool).toBe(SEED_SAFE_EXIT.EUR);
});

test("rebalance moves the active pool and leaves no proposal to approve", async () => {
  const k = bridge();
  await k.allocate("USD", "1000");
  await k.rebalance("USD", "1000");

  expect(await client.activePool("USD")).not.toBe(SEED_POOLS.USD);
  expect(await client.poolStatus((await client.activePool("USD")) ?? "")).toBe("active");
  expect(await client.pendingExit("USD")).toBeNull();
});
