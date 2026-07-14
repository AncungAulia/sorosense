import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../Button";

test("renders label and fires onClick", async () => {
  const onClick = vi.fn();
  render(<Button onClick={onClick}>Get started</Button>);
  const btn = screen.getByRole("button", { name: "Get started" });
  await userEvent.click(btn);
  expect(onClick).toHaveBeenCalledOnce();
});

test("applies the glass variant class", () => {
  render(<Button variant="glass">Other wallets</Button>);
  expect(screen.getByRole("button", { name: "Other wallets" }).className).toContain("bg-white");
});
