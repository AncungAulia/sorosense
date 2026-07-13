import { render, screen, fireEvent } from "@testing-library/react";
import { Dialog } from "../Dialog";

test("open: portals a labelled dialog with its children", () => {
  render(<Dialog open onClose={() => {}} label="Approve safe exit"><p>modal body</p></Dialog>);
  expect(screen.getByRole("dialog", { name: "Approve safe exit" })).toBeInTheDocument();
  expect(screen.getByText("modal body")).toBeVisible();
});

test("Escape and backdrop click both close", () => {
  const onClose = vi.fn();
  render(<Dialog open onClose={onClose} label="Approve safe exit"><p>x</p></Dialog>);
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.click(screen.getByTestId("dialog-wrap")); // click the wrapper (not the panel) → close
  expect(onClose).toHaveBeenCalledTimes(2);
});

test("locks body scroll while open and restores it on close", () => {
  const { rerender } = render(<Dialog open onClose={() => {}} label="Approve safe exit"><p>x</p></Dialog>);
  expect(document.body.style.overflow).toBe("hidden");
  rerender(<Dialog open={false} onClose={() => {}} label="Approve safe exit"><p>x</p></Dialog>);
  expect(document.body.style.overflow).toBe("");
});
