import { render, screen } from "@testing-library/react";
import { Identicon, identiconCells } from "../Identicon";

const A = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWK3X9";
const B = "GZYXWVUTSRQPONMLKJIHGFEDCBA765432ZYXWVUTSRQPONMLKJIHGFEDQ7P2";

test("is deterministic for a given address", () => {
  expect(identiconCells(A)).toEqual(identiconCells(A));
});

test("different addresses produce different grids", () => {
  expect(identiconCells(A)).not.toEqual(identiconCells(B));
});

test("the grid is 5x5 and horizontally symmetric", () => {
  const cells = identiconCells(A);
  expect(cells).toHaveLength(25);
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      expect(cells[y * 5 + x]).toBe(cells[y * 5 + (4 - x)]);
    }
  }
});

test("renders an accessible svg", () => {
  render(<Identicon address={A} />);
  expect(screen.getByLabelText("Wallet identicon")).toBeInTheDocument();
});
