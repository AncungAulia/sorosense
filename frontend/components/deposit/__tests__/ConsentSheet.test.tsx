import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConsentSheet } from "../ConsentSheet";

test("shows one-time mandate copy with no risk tier and fires onAgree", async () => {
  const user = userEvent.setup();
  const onAgree = vi.fn();
  render(<ConsentSheet open onAgree={onAgree} onClose={() => {}} />);
  expect(screen.getByText(/one-time/i)).toBeInTheDocument();
  expect(screen.queryByText(/conservative|balanced|risk|tier/i)).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /agree & sign/i }));
  expect(onAgree).toHaveBeenCalled();
});
