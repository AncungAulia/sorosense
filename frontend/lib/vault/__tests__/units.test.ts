import { UNIT, toAmount, fromAmount, formatCurrency } from "../units";

test("toAmount parses decimals to base units and floors", () => {
  expect(toAmount("1024.30")).toBe(10_243_000_000n);
  expect(toAmount("1,024.30")).toBe(10_243_000_000n);
  expect(toAmount("0")).toBe(0n);
  expect(toAmount("0.00000009")).toBe(0n); // below 1 base unit → floors to 0
  expect(UNIT).toBe(10_000_000n);
});

test("fromAmount renders base units as a 2dp string", () => {
  expect(fromAmount(10_243_000_000n)).toBe("1024.30");
  expect(fromAmount(0n)).toBe("0.00");
});

test("formatCurrency adds the currency symbol and grouping", () => {
  expect(formatCurrency(10_243_000_000n, "USD")).toBe("$1,024.30");
  expect(formatCurrency(9_201_000_000n, "EUR")).toBe("€920.10");
});
