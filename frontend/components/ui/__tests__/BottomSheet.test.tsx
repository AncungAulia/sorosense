import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BottomSheet } from "../BottomSheet";
test("shows content when open and closes on scrim click", async () => {
  const onClose = vi.fn();
  render(<BottomSheet open onClose={onClose} label="Deposit"><p>sheet body</p></BottomSheet>);
  expect(screen.getByText("sheet body")).toBeVisible();
  await userEvent.click(screen.getByTestId("scrim"));
  expect(onClose).toHaveBeenCalledOnce();
});
test("is not shown when closed", () => {
  render(<BottomSheet open={false} onClose={() => {}}><p>hidden body</p></BottomSheet>);
  expect(screen.getByTestId("sheet").className).not.toContain("translate-y-0");
});
