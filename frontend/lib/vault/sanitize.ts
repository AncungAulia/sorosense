/**
 * Normalize a raw decimal-input string for the desktop drawer amount fields, mirroring the mockup's
 * `sanitizeNum` (docs/mockups/sorosense-mock-2-desktop.html): comma→dot, digits + one dot only,
 * leading zeros dropped ("06"→"6") except the single zero before a dot ("0.5"), "" and "." →"0".
 * Pure: takes/returns a string, so it is trivially testable and reused by both drawers.
 */
export function sanitizeAmount(raw: string): string {
  let v = raw.replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const i = v.indexOf(".");
  if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, "");
  v = v.replace(/^0+(?=\d)/, "");
  if (v.startsWith(".")) v = "0" + v;
  if (v === "") v = "0";
  return v;
}
