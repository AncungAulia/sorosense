import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Switch } from "../Switch";

test("with onChange it is a live control — pressable, one call per press", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<Switch checked={false} label="Auto reinvest rewards" onChange={onChange} />);

  const control = screen.getByRole("switch", { name: "Auto reinvest rewards" });
  expect(control).toBeEnabled();
  expect(control).not.toHaveAttribute("aria-disabled");

  await user.click(control);
  expect(onChange).toHaveBeenCalledTimes(1);
});

test("readOnly is a state display — disabled, announced as such, and onChange never fires", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  // Both props together is the in-flight case: a live control that must not accept a second press
  // until the write lands. `readOnly` wins.
  render(<Switch checked label="Auto reinvest rewards" readOnly onChange={onChange} />);

  const control = screen.getByRole("switch");
  expect(control).toBeDisabled();
  expect(control).toHaveAttribute("aria-disabled", "true");

  await user.click(control);
  expect(onChange).not.toHaveBeenCalled();
});

test("aria-checked tracks `checked` in both modes", () => {
  const { rerender } = render(<Switch checked={false} label="Auto reinvest rewards" onChange={vi.fn()} />);
  expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");

  rerender(<Switch checked label="Auto reinvest rewards" onChange={vi.fn()} />);
  expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");

  rerender(<Switch checked label="Auto reinvest rewards" readOnly />);
  expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");

  // The real case for this leg: a revoked depositor whose row is still loading (checked=false,
  // readOnly=true). `aria-checked` must follow `checked`, never the readOnly flag.
  rerender(<Switch checked={false} label="Auto reinvest rewards" readOnly />);
  expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
});
