import { describe, expect, it } from "vitest";
import { lastSpokenTranslation, spokenTranslations } from "./spoken-translations";

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
