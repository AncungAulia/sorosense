import { render, screen, fireEvent } from "@testing-library/react";
import { Drawer } from "../Drawer";

test("open: portals a labelled dialog with its children and moves focus in", () => {
  render(<Drawer open onClose={() => {}} label="Deposit"><p>drawer body</p></Drawer>);
  const panel = screen.getByRole("dialog", { name: "Deposit" });
  expect(panel).toBeInTheDocument();
  expect(screen.getByText("drawer body")).toBeVisible();
  expect(document.activeElement).toBe(panel);
});

test("Escape calls onClose", () => {
  const onClose = vi.fn();
  render(<Drawer open onClose={onClose} label="Deposit"><p>x</p></Drawer>);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
});

test("locks body scroll while open and restores it on close", () => {
  const { rerender } = render(<Drawer open onClose={() => {}} label="Deposit"><p>x</p></Drawer>);
  expect(document.body.style.overflow).toBe("hidden");
  rerender(<Drawer open={false} onClose={() => {}} label="Deposit"><p>x</p></Drawer>);
  expect(document.body.style.overflow).toBe("");
});

test("closed: the dialog is aria-hidden (excluded from the a11y tree)", () => {
  render(<Drawer open={false} onClose={() => {}} label="Deposit"><p>x</p></Drawer>);
  expect(screen.queryByRole("dialog")).toBeNull(); // getByRole excludes aria-hidden
});
