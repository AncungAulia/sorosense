import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Keypad } from "../Keypad";

function Harness() {
  const [v, setV] = useState("0");
  return <Keypad value={v} onChange={setV} symbol="$" onQuick={() => setV("100.00")} />;
}

test("typing digits builds the amount; backspace trims", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "1" }));
  await user.click(screen.getByRole("button", { name: "2" }));
  expect(screen.getByTestId("keypad-value")).toHaveTextContent("12");
  await user.click(screen.getByRole("button", { name: "Backspace" }));
  expect(screen.getByTestId("keypad-value")).toHaveTextContent("1");
});

test("quick-fill sets the amount", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Max" }));
  expect(screen.getByTestId("keypad-value")).toHaveTextContent("100.00");
});
