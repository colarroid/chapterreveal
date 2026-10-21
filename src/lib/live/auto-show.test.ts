import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { shapeOf, type Translation } from "@/lib/scripture/bible";
import { detect, formatRef } from "@/lib/scripture/parser";
import { HOLD_MS, HOLD_NUMBER_MS, holdMs, readiness } from "./auto-show";

const kjv: Translation = JSON.parse(fs.readFileSync(path.join(__dirname, "../../../public/bibles/kjv.json"), "utf8"));
const bible = shapeOf(kjv);

/** The readiness of the first detection in a partial transcript. */
const ready = (text: string, final = false) => {
  const d = detect(text, bible).detections[0];
  return d ? `${formatRef(d.ref)} ${readiness(text, d, bible, final)}` : "none";
};

describe("auto mode readiness", () => {
  it("fires on a complete reference at the end of the partial", () => {
    expect(ready("turn with me to John chapter three verse sixteen")).toBe("John 3:16 now");
    expect(ready("Romans 8:28")).toBe("Romans 8:28 now");
  });

  it("holds while the verse number may still grow", () => {
    expect(ready("Romans chapter eight verse twenty")).toBe("Romans 8:20 hold");
    expect(ready("Psalm one hundred and nineteen verse one")).toBe("Psalm 119:1 hold");
  });

  it("holds when a range or list may follow", () => {
    expect(ready("John 3 verse 16 to")).toBe("John 3:16 hold");
    expect(ready("Proverbs 3, 5 and")).toBe("Proverbs 3:5 hold");
  });

  it("fires once other words follow the reference", () => {
    expect(ready("Romans chapter eight verse twenty says that")).toBe("Romans 8:20 now");
  });

  it("fires on a final transcript, unless it stopped on twenty, thirty…", () => {
    expect(ready("Romans chapter eight verse sixteen", true)).toBe("Romans 8:16 now");
    // The next stretch may carry on with the units (a real service: Luke 9:20
    // flashed up before 9:23).
    expect(ready("Luke chapter nine verse twenty", true)).toBe("Luke 9:20 hold");
    expect(ready("Luke chapter nine verse twenty says", true)).toBe("Luke 9:20 now");
  });

  it("holds longer after twenty, thirty… than after other words", () => {
    const hold = (text: string) => holdMs(text, detect(text, bible).detections[0]);
    expect(hold("Luke fourteen twenty")).toBe(HOLD_NUMBER_MS);
    expect(hold("Luke chapter nine verse twenty")).toBe(HOLD_NUMBER_MS);
    expect(hold("John 3 verse 16 to")).toBe(HOLD_MS);
  });

  it("never auto-shows a chapter alone", () => {
    expect(ready("Psalm twenty three")).toBe("Psalm 23 never");
    // John is a common name: "John two" alone is left to the operator.
    expect(ready("John two")).toBe("John 2 never");
  });

  it("auto-shows a common-name book followed by chapter and verse", () => {
    expect(ready("John three sixteen")).toBe("John 3:16 now");
    expect(ready("Acts two thirty eight")).toBe("Acts 2:38 now");
  });

  it("does not hold a short verse in a chapter that cannot reach 100", () => {
    expect(ready("Romans chapter eight verse one")).toBe("Romans 8:1 now");
  });
});
