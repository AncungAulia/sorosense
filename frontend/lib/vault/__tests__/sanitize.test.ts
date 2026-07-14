import { sanitizeAmount } from "../sanitize";

test("comma becomes a dot", () => {
  expect(sanitizeAmount("1,5")).toBe("1.5");
});
test("strips non-numeric characters", () => {
  expect(sanitizeAmount("1a2b.3c")).toBe("12.3");
});
test("collapses to a single dot", () => {
  expect(sanitizeAmount("1.2.3")).toBe("1.23");
});
test("strips leading zeros but keeps a single zero", () => {
  expect(sanitizeAmount("06")).toBe("6");
  expect(sanitizeAmount("065")).toBe("65");
  expect(sanitizeAmount("00")).toBe("0");
});
test("keeps a fractional value that starts with zero", () => {
  expect(sanitizeAmount("0.5")).toBe("0.5");
});
test("empty becomes '0'", () => {
  expect(sanitizeAmount("")).toBe("0");
});
test("a bare fraction gains its leading zero", () => {
  expect(sanitizeAmount(".5")).toBe("0.5");
});
