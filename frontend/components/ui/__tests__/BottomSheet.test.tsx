import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BottomSheet } from "../BottomSheet";
test("shows content when open and closes on scrim click", async () => {
  const onClose = vi.fn();
  render(<BottomSheet open onClose={onClose} label="Deposit"><p>sheet body</p></BottomSheet>);
  expect(await screen.findByText("sheet body")).toBeVisible();
  await userEvent.click(await screen.findByTestId("scrim"));
  expect(onClose).toHaveBeenCalledOnce();
});
test("is not shown when closed", async () => {
  render(<BottomSheet open={false} onClose={() => {}}><p>hidden body</p></BottomSheet>);
  expect((await screen.findByTestId("sheet")).className).not.toContain("translate-y-0");
});
