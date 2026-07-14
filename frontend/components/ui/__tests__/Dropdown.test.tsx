import { render, screen, fireEvent } from "@testing-library/react";
import { Dropdown } from "../Dropdown";

function harness(open: boolean, onClose = () => {}) {
  return render(
    <div>
      <div className="relative">
        <button>trigger</button>
        <Dropdown open={open} onClose={onClose} label="Account"><a href="#">item</a></Dropdown>
      </div>
      <button>outside</button>
    </div>,
  );
}

test("open: shows the menu and its children", () => {
  harness(true);
  expect(screen.getByRole("menu", { name: "Account" })).toBeInTheDocument();
  expect(screen.getByText("item")).toBeVisible();
});

test("Escape closes", () => {
  const onClose = vi.fn();
  harness(true, onClose);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
});

test("mousedown outside the wrapper closes; the trigger does not", () => {
  const onClose = vi.fn();
  harness(true, onClose);
  fireEvent.mouseDown(screen.getByText("trigger")); // inside .relative wrapper → stays open
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.mouseDown(screen.getByText("outside")); // outside → closes
  expect(onClose).toHaveBeenCalledOnce();
});
