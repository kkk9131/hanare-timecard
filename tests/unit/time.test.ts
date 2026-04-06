import { describe, expect, it } from "vitest";
import {
  aggregatePunches,
  computeOvertime,
  minutesBetween,
  type PunchLike,
  splitNightMinutes,
} from "../../src/server/lib/time.js";

/** Build a unix ms from local Y/M/D HH:MM. */
function ts(y: number, mo: number, d: number, h: number, m: number): number {
  return new Date(y, mo - 1, d, h, m, 0, 0).getTime();
}

describe("minutesBetween", () => {
  it("returns floor of minute difference", () => {
    expect(minutesBetween(ts(2026, 4, 6, 9, 0), ts(2026, 4, 6, 17, 30))).toBe(8 * 60 + 30);
  });
  it("returns 0 when end <= start", () => {
    expect(minutesBetween(ts(2026, 4, 6, 9, 0), ts(2026, 4, 6, 9, 0))).toBe(0);
    expect(minutesBetween(ts(2026, 4, 6, 9, 0), ts(2026, 4, 6, 8, 0))).toBe(0);
  });
});

describe("computeOvertime", () => {
  it("returns 0 when worked <= 480", () => {
    expect(computeOvertime(0)).toBe(0);
    expect(computeOvertime(480)).toBe(0);
  });
  it("returns excess over 480", () => {
    expect(computeOvertime(541)).toBe(61);
    expect(computeOvertime(720)).toBe(240);
  });
});

describe("splitNightMinutes", () => {
  it("evening shift 18:00–23:00 → 60 minutes night (22:00-23:00)", () => {
    const n = splitNightMinutes(ts(2026, 4, 6, 18, 0), ts(2026, 4, 6, 23, 0));
    expect(n).toBe(60);
  });

  it("graveyard 22:00–05:00 → full 7h", () => {
    const n = splitNightMinutes(ts(2026, 4, 6, 22, 0), ts(2026, 4, 7, 5, 0));
    expect(n).toBe(7 * 60);
  });

  it("day shift 09:00–17:00 → 0", () => {
    const n = splitNightMinutes(ts(2026, 4, 6, 9, 0), ts(2026, 4, 6, 17, 0));
    expect(n).toBe(0);
  });

  it("late night spanning midnight 23:00–02:00 → 180 min", () => {
    const n = splitNightMinutes(ts(2026, 4, 6, 23, 0), ts(2026, 4, 7, 2, 0));
    expect(n).toBe(180);
  });

  it("early morning 04:00–08:00 → 60 min (04-05)", () => {
    const n = splitNightMinutes(ts(2026, 4, 6, 4, 0), ts(2026, 4, 6, 8, 0));
    expect(n).toBe(60);
  });
});

describe("aggregatePunches", () => {
  it("simple in/out 9-17 → 480 worked, no overtime/break/night", () => {
    const punches: PunchLike[] = [
      { punch_type: "clock_in", punched_at: ts(2026, 4, 6, 9, 0) },
      { punch_type: "clock_out", punched_at: ts(2026, 4, 6, 17, 0) },
    ];
    const r = aggregatePunches(punches);
    expect(r.worked).toBe(480);
    expect(r.break).toBe(0);
    expect(r.overtime).toBe(0);
    expect(r.night).toBe(0);
    expect(r.sessions.length).toBe(1);
  });

  it("with break: 9-18 minus 1h = 480 worked, 60 break", () => {
    const punches: PunchLike[] = [
      { punch_type: "clock_in", punched_at: ts(2026, 4, 6, 9, 0) },
      { punch_type: "break_start", punched_at: ts(2026, 4, 6, 12, 0) },
      { punch_type: "break_end", punched_at: ts(2026, 4, 6, 13, 0) },
      { punch_type: "clock_out", punched_at: ts(2026, 4, 6, 18, 0) },
    ];
    const r = aggregatePunches(punches);
    expect(r.worked).toBe(480);
    expect(r.break).toBe(60);
    expect(r.overtime).toBe(0);
  });

  it("overtime: 9-20 with 1h break → 600 worked, 120 overtime", () => {
    const punches: PunchLike[] = [
      { punch_type: "clock_in", punched_at: ts(2026, 4, 6, 9, 0) },
      { punch_type: "break_start", punched_at: ts(2026, 4, 6, 12, 0) },
      { punch_type: "break_end", punched_at: ts(2026, 4, 6, 13, 0) },
      { punch_type: "clock_out", punched_at: ts(2026, 4, 6, 20, 0) },
    ];
    const r = aggregatePunches(punches);
    expect(r.worked).toBe(600);
    expect(r.overtime).toBe(120);
  });

  it("day-spanning shift counted as 1 session", () => {
    const punches: PunchLike[] = [
      { punch_type: "clock_in", punched_at: ts(2026, 4, 6, 18, 0) },
      { punch_type: "clock_out", punched_at: ts(2026, 4, 7, 2, 0) },
    ];
    const r = aggregatePunches(punches);
    expect(r.sessions.length).toBe(1);
    expect(r.worked).toBe(8 * 60);
    // 22:00-02:00 = 4h night
    expect(r.night).toBe(240);
  });

  it("graveyard shift 22-05 with 1h break: night counts whole work range", () => {
    const punches: PunchLike[] = [
      { punch_type: "clock_in", punched_at: ts(2026, 4, 6, 22, 0) },
      { punch_type: "break_start", punched_at: ts(2026, 4, 7, 1, 0) },
      { punch_type: "break_end", punched_at: ts(2026, 4, 7, 2, 0) },
      { punch_type: "clock_out", punched_at: ts(2026, 4, 7, 5, 0) },
    ];
    const r = aggregatePunches(punches);
    expect(r.worked).toBe(7 * 60 - 60); // 360
    expect(r.break).toBe(60);
    // splitNightMinutes returns the whole window 22:00-05:00 = 420 (it doesn't subtract breaks)
    expect(r.night).toBe(420);
  });

  it("invalid_transition data: orphan clock_out generates warning", () => {
    const punches: PunchLike[] = [{ punch_type: "clock_out", punched_at: ts(2026, 4, 6, 17, 0) }];
    const r = aggregatePunches(punches);
    expect(r.sessions.length).toBe(0);
    expect(r.warnings.find((w) => w.code === "orphan_clock_out")).toBeDefined();
  });

  it("session > 24h is excluded with warning", () => {
    const punches: PunchLike[] = [
      { punch_type: "clock_in", punched_at: ts(2026, 4, 6, 9, 0) },
      { punch_type: "clock_out", punched_at: ts(2026, 4, 8, 9, 0) },
    ];
    const r = aggregatePunches(punches);
    expect(r.sessions.length).toBe(0);
    expect(r.warnings.find((w) => w.code === "session_too_long")).toBeDefined();
  });

  it("multiple sessions over a week sum correctly", () => {
    const day = (d: number) => [
      { punch_type: "clock_in" as const, punched_at: ts(2026, 4, d, 9, 0) },
      { punch_type: "clock_out" as const, punched_at: ts(2026, 4, d, 17, 0) },
    ];
    const punches: PunchLike[] = [...day(6), ...day(7), ...day(8)];
    const r = aggregatePunches(punches);
    expect(r.sessions.length).toBe(3);
    expect(r.worked).toBe(480 * 3);
  });

  it("unsorted input is sorted internally", () => {
    const punches: PunchLike[] = [
      { punch_type: "clock_out", punched_at: ts(2026, 4, 6, 17, 0) },
      { punch_type: "clock_in", punched_at: ts(2026, 4, 6, 9, 0) },
    ];
    const r = aggregatePunches(punches);
    expect(r.sessions.length).toBe(1);
    expect(r.worked).toBe(480);
  });
});
