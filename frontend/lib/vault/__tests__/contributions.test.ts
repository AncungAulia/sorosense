import { recordDeposit, recordWithdraw, getContributions, resetContributions } from "../contributions";
import { UNIT } from "../units";

// "Total earned" = value − net contributions. These net contributions are what make
// earned immune to withdrawals: a withdrawal reduces both value and contributions by the
// same amount, so earned is unchanged — even once you withdraw past your principal (which
// drives contributions negative), the earned figure survives.
test("net contributions = deposits − withdrawals, going negative past principal; reset clears", () => {
  resetContributions();
  expect(getContributions("USD")).toBe(0n);

  recordDeposit("USD", 1000n * UNIT);
  expect(getContributions("USD")).toBe(1000n * UNIT);

  recordWithdraw("USD", 300n * UNIT);
  expect(getContributions("USD")).toBe(700n * UNIT);

  // Withdrawing more than was ever deposited (i.e. cashing out gains) drives contributions
  // negative, which is exactly what keeps earned = value − contributions from dropping.
  recordWithdraw("USD", 900n * UNIT);
  expect(getContributions("USD")).toBe(-200n * UNIT);

  // Currencies are independent.
  expect(getContributions("EUR")).toBe(0n);

  resetContributions();
  expect(getContributions("USD")).toBe(0n);
});
