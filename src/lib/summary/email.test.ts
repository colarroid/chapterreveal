import { describe, expect, it } from "vitest";
import { renderSummaryEmail, type SummaryService } from "./email";

const service = (over: Partial<SummaryService> = {}): SummaryService => ({
  id: "11111111-1111-1111-1111-111111111111",
  startedAt: "2026-10-18T08:05:00Z",
  endedAt: "2026-10-18T10:20:00Z",
  minutes: 135,
  verses: ["Psalm 91:1 (KJV)", "Hebrews 12:24 (NKJV)"],
  songs: ["Way Maker"],
  transcript: "…",
  words: 9000,
  sermon: { title: "Under His Shadow", summary: "The pastor taught on God's protection.", points: ["God is a refuge", "Fear has no hold"], songs: ["Way Maker", "Goodness of God"] },
  ...over,
});

describe("weekly summary email", () => {
  it("names the day of the service in the subject", () => {
    const e = renderSummaryEmail({ churchName: "The Hope Nation Church", services: [service()] });
    expect(e.subject).toBe("Sunday service summary at The Hope Nation Church");
    const week = renderSummaryEmail({ churchName: "Hope", services: [service(), service({ startedAt: "2026-10-14T17:00:00Z" })] });
    expect(week.subject).toBe("This week's services summary at Hope");
    expect(renderSummaryEmail({ churchName: "X", services: [service()], sample: true }).subject).toMatch(/^\[Sample\] /);
  });

  it("shows the sermon, scriptures, songs (each once) and local time", () => {
    const e = renderSummaryEmail({ churchName: "Hope", services: [service()], timeZone: "Africa/Lagos" });
    expect(e.html).toContain("Under His Shadow");
    expect(e.html).toContain("Psalm 91:1 (KJV)");
    expect(e.html.match(/Way Maker/g)).toHaveLength(1);
    expect(e.html).toContain("Goodness of God");
    expect(e.html).toContain("Sunday 18 October");
    expect(e.html).toContain("9:05");
    expect(e.html).toContain("2 h 15 min");
    expect(e.text).toContain("- God is a refuge");
  });

  it("escapes what came from the transcript", () => {
    const e = renderSummaryEmail({ churchName: "A & B <Church>", services: [service({ sermon: { title: "<script>x</script>", summary: "s", points: [], songs: [] } })] });
    expect(e.html).not.toContain("<script>x");
    expect(e.html).toContain("A &amp; B &lt;Church&gt;");
  });

  it("goes out without a sermon summary when there isn't one, and doesn't mention AI", () => {
    const e = renderSummaryEmail({ churchName: "Hope", services: [service({ sermon: null })] });
    expect(e.html).toContain("Hebrews 12:24");
    expect(e.html).not.toContain("AI");
    expect(e.text).not.toContain("AI");
  });
});
