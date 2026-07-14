/**
 * The faucet's third gate: the backend API is configured, but the stablecoin's **Horizon + issuer** are
 * not (three independently-optional vars — see `.env.example`).
 *
 * The button must NOT render in that state. Its `409 needsChangeTrust` recovery builds a `changeTrust`
 * from the issuer, so with no issuer configured the control could only ever fail: every click would end
 * in "Trustline not added" and the user could never get test funds. An unusable control is worse than
 * no control.
 */
import { render, screen } from "@testing-library/react";
import { ToastProvider } from "../../../providers/ToastProvider";
import { FaucetButton } from "../FaucetButton";

vi.hoisted(() => {
  // The API is on…
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:8787";
  // …but no Horizon and no issuer: the trustline path cannot be built.
});
afterAll(() => {
  delete process.env.NEXT_PUBLIC_API_URL;
});

const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

test("with the API on but no Horizon/issuer config, the faucet button does not render", () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  useWallet.mockReturnValue({
    address: "GDUY7J7A33TQWOSOQGDO776GGLM3UQERL4J3SPT56F6YS4ID7MLDERI4",
    isConnected: true,
    signTransaction: vi.fn(),
  });

  render(
    <ToastProvider>
      <FaucetButton currency="USD" />
    </ToastProvider>,
  );

  expect(screen.queryByRole("button", { name: /Get test/ })).toBeNull();
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
