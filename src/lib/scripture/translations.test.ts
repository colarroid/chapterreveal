import { describe, expect, it } from "vitest";
import { inAdminOrder, starredFirst } from "./translations";

const list = ["kjv", "bsb", "asv", "nkjv"].map((id) => ({ id }));
const ids = (l: { id: string }[]) => l.map((t) => t.id);

describe("translation order", () => {
  it("follows the admin site's order, with unplaced ones at the end", () => {
    const order = [
      { translation_id: "asv", position: 0, hidden: false },
      { translation_id: "kjv", position: 1, hidden: true },
    ];
    const out = inAdminOrder(list, order);
    expect(ids(out)).toEqual(["asv", "kjv", "bsb", "nkjv"]);
    expect(out.find((t) => t.id === "kjv")?.hidden).toBe(true);
    expect(out.find((t) => t.id === "bsb")?.hidden).toBe(false);
  });

  it("keeps the usual order when nothing is set", () => {
    expect(ids(inAdminOrder(list, []))).toEqual(["kjv", "bsb", "asv", "nkjv"]);
  });

  it("puts starred ones first, in list order", () => {
    expect(ids(starredFirst(list, new Set(["nkjv", "bsb"])))).toEqual(["bsb", "nkjv", "kjv", "asv"]);
  });
});
