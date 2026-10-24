import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shapeOf, type Translation } from "@/lib/scripture/bible";
import { detect, formatRef, refKey } from "@/lib/scripture/parser";
import { AUTO_REPEAT_MS, AutoShow, HOLD_MS, HOLD_NUMBER_MS, holdMs, readiness, type OnScreen } from "./auto-show";

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

describe("AutoShow", () => {
  const partial = (a: AutoShow, text: string, final = false) => a.heard(detect(text, bible).detections, text, final, 100, 0);

  let shown: string[];
  let current: OnScreen | null;
  let auto: AutoShow;
  beforeEach(() => {
    vi.useFakeTimers();
    shown = [];
    current = null;
    auto = new AutoShow(bible, {
      current: () => current,
      show: (d) => {
        shown.push(formatRef(d.ref));
        current = { key: refKey(d.ref), ref: d.ref };
      },
    });
  });
  afterEach(() => vi.useRealTimers());

  it("waits on a number that may still grow, then shows the finished one", () => {
    partial(auto, "Romans eight twenty");
    expect(shown).toEqual([]);
    partial(auto, "Romans eight twenty eight");
    expect(shown).toEqual(["Romans 8:28"]);
    vi.advanceTimersByTime(2000);
    expect(shown).toEqual(["Romans 8:28"]);
  });

  it("shows a held number once the pause is long enough", () => {
    partial(auto, "Luke chapter nine verse twenty");
    expect(shown).toEqual([]);
    vi.advanceTimersByTime(HOLD_NUMBER_MS - 1);
    expect(shown).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(shown).toEqual(["Luke 9:20"]);
  });

  it("never shows a chapter on its own, or a loose reference", () => {
    partial(auto, "Psalm twenty three", true);
    partial(auto, "Numbers six twenty four", true);
    vi.advanceTimersByTime(2000);
    expect(shown).toEqual([]);
  });

  it("doesn't put up what is already up, and doesn't bring back what was just cleared", () => {
    partial(auto, "John 3:16 says", true);
    expect(shown).toEqual(["John 3:16"]);
    partial(auto, "John 3:16 again", true);
    expect(shown).toEqual(["John 3:16"]);
    current = null; // Esc
    partial(auto, "John 3:16 once more", true);
    expect(shown).toEqual(["John 3:16"]);
    vi.advanceTimersByTime(AUTO_REPEAT_MS);
    vi.setSystemTime(Date.now() + AUTO_REPEAT_MS);
    partial(auto, "John 3:16 later", true);
    expect(shown).toEqual(["John 3:16", "John 3:16"]);
  });

  it("widens the verse on screen when the preacher reads on", () => {
    partial(auto, "John 3:16 says", true);
    partial(auto, "John 3:16 to 18 says", true);
    expect(shown).toEqual(["John 3:16", "John 3:16-18"]);
  });

  it("forgets a held reference on cancel", () => {
    partial(auto, "Romans eight twenty");
    auto.cancel();
    vi.advanceTimersByTime(5000);
    expect(shown).toEqual([]);
  });
});
