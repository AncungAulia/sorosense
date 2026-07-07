import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConsentSheet } from "../ConsentSheet";

test("shows plain one-time consent copy with no risk tier and fires onAgree", async () => {
  const user = userEvent.setup();
  const onAgree = vi.fn();
  render(<ConsentSheet open onAgree={onAgree} onClose={() => {}} />);
  expect(screen.getByText(/approve once, earn automatically/i)).toBeInTheDocument();
  expect(screen.getByText(/only you can move it out/i)).toBeInTheDocument();
  expect(screen.queryByText(/conservative|balanced|risk|tier/i)).not.toBeInTheDocument();
  // No "Not now" button — dismissing is via the scrim.
  expect(screen.queryByRole("button", { name: /not now/i })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /agree & sign/i }));
  expect(onAgree).toHaveBeenCalled();
});
