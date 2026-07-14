/**
 * `useActivity` with the API **off** — the offline fallback (R6 · R11).
 *
 * The eight-row fixture is what Home, `/account/activity` and the Playwright baseline render when
 * `NEXT_PUBLIC_API_URL` is unset. The real-mode mapping is pinned in `useActivity.api.test.tsx`.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../providers/VaultProvider";
import { getActivity } from "../../lib/vault/data";
import { useActivity } from "../useActivity";

const useWallet = vi.fn();
vi.mock("../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

function Probe() {
  const { loading, items } = useActivity();
  if (loading) return <span>loading</span>;
  return (
    <ul>
      <li data-testid="count">{items.length}</li>
      {items.map((i) => (
        <li key={i.id} data-testid={`row-${i.id}`}>{i.cat}|{i.kind}|{i.detail}|{i.when}</li>
      ))}
    </ul>
  );
}

function renderFeed() {
  render(
    <VaultProvider client={new MockVaultClient()}>
      <Probe />
    </VaultProvider>,
  );
}

test("API off: the fixture renders and nothing is fetched", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  useWallet.mockReturnValue({ address: "GUSER" });
  renderFeed();

  await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("8"));
  const [first] = getActivity();
  expect(screen.getByTestId(`row-${first!.id}`).textContent).toBe(
    `${first!.cat}|${first!.kind}|${first!.detail}|${first!.when}`,
  );
  expect(fetchMock).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

test("no wallet: still the fixture, still no request", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  useWallet.mockReturnValue({ address: null });
  renderFeed();

  await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("8"));
  expect(fetchMock).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
