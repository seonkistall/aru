import { describe, expect, it } from "vitest";
import { buildRoutineIcs } from "@/lib/routine-reminder";

describe("buildRoutineIcs", () => {
  it("produces a valid VCALENDAR with two daily reminders", () => {
    const ics = buildRoutineIcs("복합성 · 토너 루틴");
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.trim().endsWith("END:VCALENDAR")).toBe(true);
    expect((ics.match(/BEGIN:VEVENT/g) || []).length).toBe(2);
    expect((ics.match(/RRULE:FREQ=DAILY/g) || []).length).toBe(2);
    expect(ics).toContain("DTSTART:20260101T080000"); // AM
    expect(ics).toContain("DTSTART:20260101T220000"); // PM
    expect(ics).toContain("SUMMARY:아루 아침 루틴");
    expect(ics).toContain("SUMMARY:아루 저녁 루틴");
    // CRLF line endings per the iCalendar spec.
    expect(ics.includes("\r\n")).toBe(true);
  });

  it("escapes commas/semicolons/backslashes in the description", () => {
    const ics = buildRoutineIcs("A, B; C\\D");
    expect(ics).toContain("A\\, B\\; C\\\\D");
  });
});
