import { describe, expect, it } from "vitest";
import { journalDateRange } from "@/app/(app)/journal/journal-query";

describe("Journal entry date ranges", () => {
  it("includes both endpoints as calendar days in the selected timezone", () => {
    expect(journalDateRange("2026-11-04", "2026-11-04", "Asia/Jakarta")).toEqual({
      from: new Date("2026-11-03T17:00:00Z"),
      to: new Date("2026-11-04T17:00:00Z"),
    });
  });

  it("uses the offset applicable to each day across DST", () => {
    expect(journalDateRange("2026-03-08", "2026-03-08", "America/New_York")).toEqual({
      from: new Date("2026-03-08T05:00:00Z"),
      to: new Date("2026-03-09T04:00:00Z"),
    });
  });

  it("includes the first midnight when local midnight repeats", () => {
    expect(journalDateRange("2021-10-29", "2021-10-29", "Asia/Amman")).toEqual({
      from: new Date("2021-10-28T21:00:00Z"),
      to: new Date("2021-10-29T22:00:00Z"),
    });
  });

  it("starts at the first valid time when local midnight is skipped", () => {
    expect(journalDateRange("2021-03-26", "2021-03-26", "Asia/Amman")).toEqual({
      from: new Date("2021-03-25T22:00:00Z"),
      to: new Date("2021-03-26T21:00:00Z"),
    });
  });

  it("rejects impossible or inverted ranges and accepts one bound", () => {
    expect(journalDateRange("2026-02-30").error).toBeTruthy();
    expect(journalDateRange("2026-03-09", "2026-03-08").error).toBeTruthy();
    expect(journalDateRange(undefined, "2026-03-08").to).toEqual(new Date("2026-03-09T00:00:00Z"));
  });
});
