// @vitest-environment node
/**
 * Contract test: the frontend's declared wire shapes (`types.ts`) against the **real** backend
 * (STE-52b / U3). This is the only thing standing between the two and silent drift — the types are
 * re-declared, not imported (the frontend must not depend on `backend`), so nothing but a real
 * response can prove they still line up.
 *
 * It boots the backend's mock-mode read surface in-process — `createApp` from
 * `backend/src/http/app.ts` over a real `MockVaultClient`, with the same deterministic stub FX
 * `server.ts` uses offline — binds it to an ephemeral localhost port, and drives it through the real
 * `apiGet` client (real `fetch`, real timeout, real decode). No network, no fixtures, no seam mocking.
 *
 * The boot is guarded: if the backend workspace cannot be loaded (a frontend-only checkout), the suite
 * skips rather than failing — the client's own unit tests (`client.test.ts`) stay the offline gate.
 *
 * The `backend/` import is test-only and deliberate; production frontend code never reaches across.
 * The bridge is GET-only (the read surface), which is all this pins.
 */

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, describe, expect, it, vi } from "vitest";
import { MockVaultClient, mockSigner } from "@sorosense/vault-client";

import { itemFromEntry } from "../../activity/map";
import { UNIT } from "../../vault/units";
import type { FeedEntry, FundingOptions, HealthResponse, Holding } from "../types";

// NOTE: `../client` is imported *dynamically*, inside each test. It reads its base URL at module scope
// (Next inlines the var), so a static import here would freeze it to "" — the API off — before the
// server below even has a port.

/** A well-formed Stellar public key — the shape the backend's routes accept. */
const DEPOSITOR = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const USD_DEPOSIT = 1024n * UNIT;

/** Deterministic offline FX — the same fixed, display-only rates `backend/src/http/server.ts` uses. */
const STUB_RATES: Record<string, number> = { USD: 1, EUR: 1.08, MXN: 0.058 };

interface Booted {
  baseUrl: string;
  close: () => Promise<void>;
}

/**
 * Boot the real backend app over a real socket. Returns null when the backend workspace is not
 * loadable, so the suite can skip instead of failing.
 */
async function boot(): Promise<Booted | null> {
  let app: { fetch: (request: Request) => Response | Promise<Response> };
  try {
    const [{ createApp }, { ActivityLog }, { InMemorySnapshotStore }] = await Promise.all([
      import("../../../../backend/src/http/app"),
      import("../../../../backend/src/api/activity"),
      import("../../../../backend/src/earnings/snapshotter"),
    ]);

    const vault = new MockVaultClient();
    // One funded bucket, so `/holdings` returns a row to decode (empty buckets are omitted by design).
    await vault
      .deposit(DEPOSITOR, "USD", USD_DEPOSIT)
      .signAndSubmit(mockSigner("depositor", DEPOSITOR));

    // One row from each source, so `/activity` returns a real merged feed: an agent action the log
    // recorded, and a user action derived from an on-chain event. Both actors, and a `froze` kind —
    // the one the UI turns into a flag.
    const log = new ActivityLog();
    log.append({ currency: "EUR", kind: "froze", detail: "Paused EURC pool for safety", ts: 1_000 });

    app = createApp({
      vault,
      fx: async (currency) => ({ ok: true, value: STUB_RATES[currency] ?? 1 }),
      earnings: { events: [], snapshots: new InMemorySnapshotStore() },
      activity: {
        log,
        userEvents: [
          { kind: "deposit", depositor: DEPOSITOR, currency: "USD", amount: USD_DEPOSIT, seq: 2, ts: 2_000 },
        ],
      },
    });
  } catch (cause) {
    console.warn("[contract] backend workspace unavailable — skipping:", cause);
    return null;
  }

  // Minimal node:http → Hono bridge (GET-only: this pins the read surface). `server.ts` uses
  // @hono/node-server for the same job, but that is a backend dependency and not resolvable here.
  const server: Server = createServer((req, res) => {
    void (async () => {
      const { port } = server.address() as AddressInfo;
      const request = new Request(`http://127.0.0.1:${port}${req.url ?? "/"}`, { method: req.method });
      const response = await app.fetch(request);
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      res.end(Buffer.from(await response.arrayBuffer()));
    })();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const booted = await boot();

if (booted) {
  // Point the client at the booted server, then drop any already-evaluated copy of it so the dynamic
  // imports below pick the base URL up.
  vi.stubEnv("NEXT_PUBLIC_API_URL", booted.baseUrl);
  vi.resetModules();
  afterAll(async () => {
    vi.unstubAllEnvs();
    await booted.close();
  });
}

const describeContract = booted ? describe : describe.skip;

describeContract("the backend read surface, through the real client", () => {
  it("GET /health decodes as HealthResponse", async () => {
    const { apiGet } = await import("../client");

    const result = await apiGet<HealthResponse>("/health");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("ok");
  });

  it("GET /holdings decodes as Holding[], with bigint fields as decimal strings", async () => {
    const { apiGet, toBigInt } = await import("../client");

    const result = await apiGet<Holding[]>("/holdings", { depositor: DEPOSITOR });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const usd = result.value.find((h) => h.currency === "USD");
    expect(usd).toBeDefined();
    if (!usd) return;

    // Every field of the declared shape is really there, with the declared type.
    expect(typeof usd.name).toBe("string");
    expect(typeof usd.venue).toBe("string");
    expect(["lending", "vault", "rwa"]).toContain(usd.kind);
    expect(Array.isArray(usd.tags)).toBe(true);
    expect(typeof usd.apy).toBe("number");
    expect(typeof usd.valueUsd).toBe("number");
    expect(typeof usd.frozen).toBe("boolean");

    // The bigint boundary: decimal strings on the wire, decoded losslessly at the edge.
    expect(typeof usd.shares).toBe("string");
    expect(typeof usd.value).toBe("string");
    expect(toBigInt(usd.value)).toBe(USD_DEPOSIT);
    expect(toBigInt(usd.shares)).toBeGreaterThan(0n);

    // Safety is invisible: the backend exposes no risk/label/score/tier field, and neither do we.
    for (const key of ["risk", "label", "score", "tier"]) {
      expect(usd).not.toHaveProperty(key);
    }
  });

  it("GET /activity decodes as FeedEntry[], and the real rows map to real feed items", async () => {
    const { apiGet } = await import("../client");

    const result = await apiGet<FeedEntry[]>("/activity", { depositor: DEPOSITOR });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Both sources are really there: the agent's own log, and the user action derived from an event.
    const agent = result.value.find((e) => e.actor === "agent");
    const user = result.value.find((e) => e.actor === "you");
    expect(agent).toBeDefined();
    expect(user).toBeDefined();
    if (!agent || !user) return;

    // Every field of the declared shape, with the declared type.
    for (const entry of [agent, user]) {
      expect(typeof entry.seq).toBe("number");
      expect(["you", "agent"]).toContain(entry.actor);
      expect(typeof entry.kind).toBe("string");
      expect(typeof entry.detail).toBe("string");
      // Safety is invisible: the backend exposes no risk/label/score/tier field, and neither do we.
      for (const key of ["risk", "label", "score", "tier"]) {
        expect(entry).not.toHaveProperty(key);
      }
    }
    expect(user.depositor).toBe(DEPOSITOR); // present on user rows only
    expect(agent.depositor).toBeUndefined();

    // The feed arrives most-recent-first, by the backend's monotonic seq — the order we render in.
    expect([...result.value].map((e) => e.seq)).toEqual(
      [...result.value].map((e) => e.seq).sort((a, b) => b - a),
    );

    // And the real rows, through the real mapper, are the rows the list renders: the agent's freeze is
    // flagged and lands in Automated; the user's deposit lands in Yours.
    const now = 3_600_000 + 2_000;
    expect(itemFromEntry(agent, now)).toEqual({
      id: agent.seq,
      cat: "auto",
      kind: "froze",
      detail: "Paused EURC pool for safety",
      when: "1h ago",
      flag: true,
    });
    expect(itemFromEntry(user, now)).toMatchObject({ cat: "you", kind: "deposit", when: "1h ago" });
  });

  it("GET /funding decodes as FundingOptions, with RWA options carrying no apy", async () => {
    const { apiGet } = await import("../client");

    const result = await apiGet<FundingOptions>("/funding");

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.stablecoins.map((s) => s.sym)).toContain("USDC");
    for (const coin of result.value.stablecoins) {
      expect(typeof coin.currency).toBe("string");
      expect(Array.isArray(coin.chains)).toBe(true);
    }
    for (const rwa of result.value.rwa) {
      expect(typeof rwa.id).toBe("string");
      expect(rwa).not.toHaveProperty("apy");
    }
  });

  it("a missing required parameter comes back as the shaped error arm, not a throw", async () => {
    const { apiGet } = await import("../client");

    const result = await apiGet<Holding[]>("/holdings");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("bad_request");
    expect(result.status).toBe(400);
  });
});
