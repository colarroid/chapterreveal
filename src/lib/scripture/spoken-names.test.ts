import { describe, expect, it } from "vitest";
import { lastSpokenTranslation } from "./spoken-translations";

// Full names as preachers say them, with and without "Version" or "Bible".
const FULL_NAMES: [string, string][] = [
  ["let's read it in the New King James Version", "NKJV"],
  ["the New King James Bible says", "NKJV"],
  ["from the New King James", "NKJV"],
  ["the King James Bible", "KJV"],
  ["the Authorized Version", "KJV"],
  ["the New Living Translation puts it this way", "NLT"],
  ["read it from the New Living", "NLT"],
  ["the Amplified Bible says", "AMP"],
  ["in the Amplified Version", "AMP"],
  ["the Amplified Classic says", "AMPC"],
  ["the New International Version", "NIV"],
  ["the English Standard Version", "ESV"],
  ["the Passion Translation says", "TPT"],
  ["in the Message Bible", "MSG"],
  ["the Good News Translation", "GNT"],
  ["the New American Standard Bible", "NASB"],
  ["the Berean Standard Bible", "BSB"],
  ["Young's Literal Translation", "YLT"],
  ["the Darby Translation", "DBY"],
];

describe("full translation names", () => {
  it.each(FULL_NAMES)("%s -> %s", (text, short) => {
    expect(lastSpokenTranslation(text)?.short).toBe(short);
  });
});
