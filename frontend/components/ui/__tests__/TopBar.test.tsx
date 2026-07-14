import { render, screen } from "@testing-library/react";
import { TopBar } from "../TopBar";

vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => ({ address: "GABC…K3X9" }) }));

test("renders brand and an account button with a deterministic identicon", () => {
  render(<TopBar onAvatarClick={() => {}} />);
  expect(screen.getByText("SoroSense")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /account/i })).toBeInTheDocument();
});

test("no risk/safety words on the topbar (R11)", () => {
  render(<TopBar onAvatarClick={() => {}} />);
  expect(screen.queryByText(/\b(risk|score|Safe|Watch|Sentinel)\b/i)).toBeNull();
});
