/**
 * `useFunding` with the API **off** — the Add-funds list falls back to `STABLECOINS` (R7 · R11).
 * The real-mode half is in `useFunding.api.test.tsx`.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { STABLECOINS } from "../../lib/vault/data";
import { useFunding } from "../useFunding";

function Probe() {
  const { loading, options } = useFunding();
  if (loading) return <span>loading</span>;
  return (
    <ul>
      <li data-testid="syms">{options.stablecoins.map((s) => s.sym).join(",")}</li>
      <li data-testid="rwa">{options.rwa.length}</li>
    </ul>
  );
}

test("API off: the fixture list renders and nothing is fetched", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  render(<Probe />);

  await waitFor(() => expect(screen.getByTestId("syms")).toBeInTheDocument());
  expect(screen.getByTestId("syms").textContent).toBe(STABLECOINS.map((s) => s.sym).join(","));
  expect(screen.getByTestId("rwa").textContent).toBe("0"); // no RWA catalog offline
  expect(fetchMock).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
