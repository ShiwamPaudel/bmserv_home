// A4 label sheet: 2 across x 4 down, each cell 105 x 74.25 mm (A7, 12.5 % of A4). DESIGN.md section 8.
export const CELLS_PER_SHEET = 8;
export const CELL_W_MM = 105;
export const CELL_H_MM = 74.25;

export type Placed<T> = { sheet: number; position: number; col: number; row: number; xMm: number; yMm: number; item: T | null };

/**
 * Places items starting at `start` (1–8) on the first sheet; earlier positions stay blank.
 * Further items continue on new sheets from position 1. Every sheet has all 8 cells (blank ones are null).
 */
export function placeLabels<T>(items: T[], start: number): Placed<T>[][] {
  const first = Math.min(Math.max(Math.floor(start) || 1, 1), CELLS_PER_SHEET);
  const slots: (T | null)[] = [...Array<null>(first - 1).fill(null), ...items];
  const sheets: Placed<T>[][] = [];
  for (let i = 0; i < Math.max(slots.length, 1); i += CELLS_PER_SHEET) {
    const sheetNo = sheets.length + 1;
    sheets.push(
      Array.from({ length: CELLS_PER_SHEET }, (_, k) => {
        const col = k % 2;
        const row = Math.floor(k / 2);
        return { sheet: sheetNo, position: k + 1, col, row, xMm: col * CELL_W_MM, yMm: row * CELL_H_MM, item: slots[i + k] ?? null };
      }),
    );
  }
  return sheets;
}
