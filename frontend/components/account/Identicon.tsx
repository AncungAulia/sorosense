/**
 * A deterministic 5x5 identicon derived from the wallet address. Horizontally symmetric, like the
 * mock: only the left three columns carry information, the right two mirror them.
 */
const SIZE = 5;

/** djb2 — small, deterministic, and enough entropy for 15 bits of grid. */
function hash(address: string): number {
  let h = 5381;
  for (let i = 0; i < address.length; i++) h = ((h * 33) ^ address.charCodeAt(i)) >>> 0;
  return h;
}

/** 25 cells, row-major. `cells[y * 5 + x]` is true when that pixel is inked. */
export function identiconCells(address: string): boolean[] {
  const h = hash(address);
  const cells = new Array<boolean>(SIZE * SIZE).fill(false);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < 3; x++) {
      const on = ((h >>> (y * 3 + x)) & 1) === 1;
      cells[y * SIZE + x] = on;
      cells[y * SIZE + (SIZE - 1 - x)] = on;
    }
  }
  return cells;
}

export function Identicon({ address, size = 90 }: { address: string; size?: number }) {
  const cells = identiconCells(address);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 5 5"
      shapeRendering="crispEdges"
      role="img"
      aria-label="Wallet identicon"
      className="mx-auto mb-3.5 block overflow-hidden rounded-full bg-[#e9e9e6]"
    >
      {cells.map((on, i) =>
        on ? <rect key={i} x={i % SIZE} y={Math.floor(i / SIZE)} width="1" height="1" fill="#1a1a1a" /> : null,
      )}
    </svg>
  );
}
