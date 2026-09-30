import { describe, expect, it } from "vitest";
import { fmtClock, fmtDuration } from "@/lib/format";
import { greeting } from "@/lib/parent";

describe("formatting", () => {
  it("formats clock times", () => {
    expect(fmtClock("09:00:00")).toBe("9:00 am");
    expect(fmtClock("13:05:00")).toBe("1:05 pm");
    expect(fmtClock("00:30:00")).toBe("12:30 am");
    expect(fmtClock(null)).toBe("");
  });
  it("formats durations in minutes, never 0", () => {
    expect(fmtDuration(372)).toBe("6 min");
    expect(fmtDuration(20)).toBe("1 min");
    expect(fmtDuration(null)).toBe("");
  });
  it("greets by time of day", () => {
    expect(greeting("Riya", 8)).toBe("Good morning, Riya");
    expect(greeting("Riya", 14)).toBe("Good afternoon, Riya");
    expect(greeting("Riya", 20)).toBe("Good evening, Riya");
  });
});
