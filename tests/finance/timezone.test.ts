import { describe, expect, it } from "vitest";
import { zonedPeriod } from "@/lib/dates";

describe("user-local financial periods", () => {
  it("Monday morning in Jakarta is already the new trading week", () => {
    const week = zonedPeriod("WEEKLY", new Date("2026-11-15T23:30:00Z"), "Asia/Jakarta");
    expect(week.start.toISOString()).toBe("2026-11-15T17:00:00.000Z");
    expect(week.end.toISOString()).toBe("2026-11-22T17:00:00.000Z");
  });
  it("uses a 23-hour day across the New York DST transition", () => {
    const day = zonedPeriod("DAILY", new Date("2026-03-08T16:00:00Z"), "America/New_York");
    expect(day.end.getTime() - day.start.getTime()).toBe(23 * 3600000);
  });
});
