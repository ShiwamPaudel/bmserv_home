import { describe, expect, it } from "vitest";
import { CELL_H_MM, CELL_W_MM, placeLabels } from "./labelSheet";

describe("label sheet positions (DESIGN.md section 8)", () => {
  it("each label is 105 x 74.25 mm, one eighth of A4", () => {
    expect(CELL_W_MM * 2).toBe(210);
    expect(CELL_H_MM * 4).toBe(297);
    expect((CELL_W_MM * CELL_H_MM) / (210 * 297)).toBeCloseTo(0.125);
  });

  it("a single label uses one cell; the rest stays blank", () => {
    const [sheet] = placeLabels(["A"], 1);
    expect(sheet?.filter((c) => c.item)).toHaveLength(1);
    expect(sheet?.[0]).toMatchObject({ position: 1, col: 0, row: 0, xMm: 0, yMm: 0, item: "A" });
  });

  it("start position skips used cells on a partly used sheet", () => {
    const [sheet] = placeLabels(["A", "B"], 6);
    expect(sheet?.map((c) => c.item)).toEqual([null, null, null, null, null, "A", "B", null]);
    expect(sheet?.[5]).toMatchObject({ col: 1, row: 2, xMm: 105, yMm: 148.5 });
  });

  it("8 labels fill one page; more continue on a new sheet from position 1", () => {
    expect(placeLabels(Array.from({ length: 8 }, (_, i) => i), 1)).toHaveLength(1);
    const two = placeLabels(["A", "B", "C"], 7);
    expect(two).toHaveLength(2);
    expect(two[1]?.[0]?.item).toBe("C");
  });

  it("out-of-range start is clamped", () => {
    expect(placeLabels(["A"], 0)[0]?.[0]?.item).toBe("A");
    expect(placeLabels(["A"], 99)[0]?.[7]?.item).toBe("A");
  });
});
