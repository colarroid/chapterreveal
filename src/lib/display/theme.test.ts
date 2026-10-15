import { describe, expect, it } from "vitest";
import { cleanDisplay, cleanTheme, DEFAULT_DISPLAY, isOwnMedia, PRESETS } from "./theme";

process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "demo-church";
const own = "https://res.cloudinary.com/demo-church/image/upload/f_auto,q_auto,w_1920,c_limit/scriptures/backgrounds/church-1/abc123";

describe("display themes", () => {
  it("falls back to the classic look when nothing is set", () => {
    expect(cleanDisplay(undefined)).toEqual(DEFAULT_DISPLAY);
    expect(cleanDisplay(undefined).scripture.preset).toBe("classic");
  });

  it("keeps every preset intact", () => {
    for (const p of PRESETS) expect(cleanTheme(p.theme, DEFAULT_DISPLAY.scripture)).toEqual(p.theme);
  });

  it("only accepts this app's own uploaded backgrounds", () => {
    expect(isOwnMedia(own)).toBe(true);
    expect(isOwnMedia("https://evil.example/x.jpg")).toBe(false);
    expect(isOwnMedia(`${own}/../../other`)).toBe(false);
    // Another Cloudinary account, or outside the backgrounds folder.
    expect(isOwnMedia(own.replace("demo-church", "someone-else"))).toBe(false);
    expect(isOwnMedia("https://res.cloudinary.com/demo-church/image/upload/other/x")).toBe(false);
    expect(isOwnMedia("https://res.cloudinary.com/demo-church/video/upload/q_auto,w_1920,c_limit/scriptures/backgrounds/church-1/clip.mp4")).toBe(true);
    const t = cleanTheme({ ...PRESETS[0].theme, background: { type: "image", url: "https://evil.example/x.jpg" } }, DEFAULT_DISPLAY.scripture);
    expect(t.background).toEqual(DEFAULT_DISPLAY.scripture.background);
  });

  it("keeps the animated-gradient choice, and only as true", () => {
    const g = { type: "gradient", from: "#ffc500", to: "#c21500", angle: 90 };
    expect(cleanTheme({ ...PRESETS[0].theme, background: { ...g, animate: true } }, DEFAULT_DISPLAY.scripture).background).toEqual({ ...g, animate: true });
    expect(cleanTheme({ ...PRESETS[0].theme, background: { ...g, animate: "yes" } }, DEFAULT_DISPLAY.scripture).background).toEqual(g);
  });

  it("rejects colours and values that aren't plain", () => {
    const t = cleanTheme(
      { ...PRESETS[0].theme, textColor: "red; background:url(x)", accentColor: "#12345", scale: 9, dim: -1, font: "comic", align: "right", position: "side" },
      DEFAULT_DISPLAY.scripture,
    );
    expect(t.textColor).toBe("#ffffff");
    expect(t.accentColor).toBe(DEFAULT_DISPLAY.scripture.accentColor);
    expect(t.scale).toBe(1.4);
    expect(t.dim).toBe(0);
    expect(t.font).toBe("serif");
    expect(t.align).toBe("center");
    expect(t.position).toBe("middle");
  });
});
