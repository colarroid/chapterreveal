import { describe, expect, it } from "vitest";
import { lastSpokenTranslation, matchSpokenTranslation, spokenTranslations } from "./spoken-translations";
import { BUILT_IN_TRANSLATIONS } from "./translations";

const last = (t: string) => lastSpokenTranslation(t)?.short ?? null;

describe("translations named aloud", () => {
  it("hears the ones from a real service", () => {
    expect(last("in NKJV. Sorry. In KJV.")).toBe("KJV");
    expect(last("second Peter chapter four verse three and KJV.")).toBe("KJV");
  });

  it("tells the King James family apart", () => {
    expect(last("John 3:16 in the American King James")).toBe("AKJV");
    expect(last("read it from the Updated King James Version")).toBe("UKJV");
    expect(last("Psalm 23 in the King James")).toBe("KJV");
  });

  it("hears Webster only as a Bible", () => {
    expect(last("in Webster's Bible")).toBe("WBT");
    expect(last("reading from Webster")).toBe("WBT");
    expect(last("Webster defines grace as favour")).toBeNull();
  });

  it("knows full names and spaced-out letters", () => {
    expect(last("let's read it in the King James Version")).toBe("KJV");
    expect(last("from the New King James")).toBe("NKJV");
    expect(last("K J V please")).toBe("KJV");
    expect(last("the New International Version says")).toBe("NIV");
    expect(last("the Berean Standard Bible")).toBe("BSB");
    expect(last("American Standard Version")).toBe("ASV");
    expect(last("New American Standard")).toBe("NASB");
  });

  it("doesn't count King James inside New King James", () => {
    expect(spokenTranslations("New King James").map((t) => t.short)).toEqual(["NKJV"]);
  });

  it("needs a marker for names that are everyday words", () => {
    expect(last("I have good news for you today")).toBeNull();
    expect(last("the message of the cross")).toBeNull();
    expect(last("he amplified the problem")).toBeNull();
    expect(last("read it in the Message")).toBe("MSG");
    expect(last("the Amplified version")).toBe("AMP");
    expect(last("in the amplified")).toBe("AMP");
    expect(last("Good News Bible")).toBe("GNT");
  });

  it("ignores sermons that name no translation", () => {
    expect(last("turn with me to Romans chapter eight verse twenty eight")).toBeNull();
    expect(last("the kingdom of God is near")).toBeNull();
  });
});

describe("every translation can be asked for by name", () => {
  // How preachers say each one we have or expect: built-in, added (NKJV,
  // NLT) and the licences being requested (AMP, AMPC, TPT, NIV, ESV).
  const SAID: [string, string][] = [
    ["Let's read John 3:16 in the King James Version", "KJV"],
    ["turn with me, New King James", "NKJV"],
    ["I'm reading from the New Living Translation", "NLT"],
    ["in the NLT", "NLT"],
    ["Berean Standard Bible", "BSB"],
    ["the New Heart English Bible", "NHEB"],
    ["American Standard Version", "ASV"],
    ["Bible in Basic English", "BBE"],
    ["the American King James Version", "AKJV"],
    ["the Updated King James", "UKJV"],
    ["read it in Darby", "DBY"],
    ["Young's Literal Translation", "YLT"],
    ["in Webster's Bible", "WBT"],
    ["A Conservative Version", "ACV"],
    ["read from the Amplified", "AMP"],
    ["the Amplified Classic edition", "AMPC"],
    ["the Classic Amplified", "AMPC"],
    ["The Passion Translation", "TPT"],
    ["in the NIV", "NIV"],
    ["English Standard Version", "ESV"],
  ];
  it.each(SAID)("%s -> %s", (text, short) => {
    expect(last(text)).toBe(short);
  });

  it("covers every built-in translation", () => {
    const heard = new Set(SAID.map(([, s]) => s));
    for (const t of BUILT_IN_TRANSLATIONS) expect(heard.has(t.short)).toBe(true);
  });
});

describe("matching what was heard to the church's list", () => {
  const list = [
    { id: "kjv", short: "KJV" },
    { id: "nkjv", short: "nkjv" },
    { id: "nlt", short: "NLT" },
    { id: "ampc", short: "AMPC" },
  ];
  it("finds it whatever case it was uploaded in", () => {
    expect(matchSpokenTranslation(list, "NKJV")?.id).toBe("nkjv");
    expect(matchSpokenTranslation(list, "KJV")?.id).toBe("kjv");
  });
  it("falls back to another edition of the same translation", () => {
    expect(matchSpokenTranslation(list, "AMP")?.id).toBe("ampc");
  });
  it("treats the Good News Translation (GNT) and Good News Bible (GNB) as one", () => {
    const gnb = [{ id: "gnb", short: "GNB" }];
    for (const said of ["GNT", "GNB"]) expect(matchSpokenTranslation(gnb, said)?.id).toBe("gnb");
    expect(matchSpokenTranslation([{ id: "gnt", short: "GNT" }], "GNB")?.id).toBe("gnt");
    for (const text of ["give me the GNT", "G N B please", "the Good News Bible", "read it in the Good News Translation", "Good News Version"]) expect(last(text)).toBe("GNT");
    // Good news in a sermon isn't a request for a translation.
    expect(last("I have good news for you today")).toBeNull();
    expect(last("we rejoice in the good news of Jesus")).toBeNull();
  });
  it("finds nothing when the church doesn't have it", () => {
    expect(matchSpokenTranslation(list, "ESV")).toBeUndefined();
  });
});
