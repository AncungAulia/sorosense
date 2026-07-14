import { test } from "@playwright/test";
import { connectWallet, expectDesktopHome, shot } from "./support/journey";

test("desktop Overview renders and the mobile bottom nav is hidden", async ({ page }) => {
  await connectWallet(page); // stubbed wallet → /home
  await expectDesktopHome(page);
  await shot(page, "desktop-01-overview");
});
