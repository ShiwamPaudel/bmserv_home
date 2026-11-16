import { describe, expect, it } from "vitest";
import { roles, type Role } from "./enums";
import { assignableRoles, can, canManagePerson, permissions, type Action } from "./permissions";
import {
  addDays,
  addMonths,
  isPlausibleDate,
  parseAd,
  adToBs,
  bsToAd,
  daysBetween,
  daysInBsMonth,
  durationParts,
  formatDate,
  formatMoment,
  nepalTime,
  todayNepal,
} from "./dates";
import { coverageLastDay, isCoverageCurrent, pmsSchedule, rangesOverlap } from "./pms";
import { breakdownNumber, modelKey, serialKey } from "./keys";
import { parseCsv, toCsv } from "./csv";
import { isCountryCode, joinPhone, splitPhone, whatsAppLink, whatsAppNumber } from "./phone";

describe("permissions (PRD section 3)", () => {
  const table: [Action, Role[]][] = [
    ["view", ["admin", "lead", "engineer"]],
    ["breakdown.report", ["admin", "lead", "engineer", "staff"]],
    ["breakdown.work", ["admin", "lead", "engineer"]],
    ["pms.markDone", ["admin", "lead", "engineer"]],
    ["pms.remind", ["admin", "lead", "engineer"]],
    ["move.temporary", ["admin", "lead", "engineer"]],
    ["file.upload", ["admin", "lead", "engineer"]],
    ["serviceEngineer.manage", ["admin", "lead", "engineer"]],
    ["equipment.designate", ["admin", "lead", "engineer"]],
    ["label.print", ["admin", "lead", "engineer"]],
    ["equipment.edit", ["admin", "lead"]],
    ["model.edit", ["admin", "lead"]],
    ["equipment.import", ["admin", "lead"]],
    ["move.permanent", ["admin", "lead"]],
    ["department.edit", ["admin", "lead"]],
    ["provider.edit", ["admin", "lead"]],
    ["coverage.edit", ["admin", "lead"]],
    ["pms.editDate", ["admin", "lead"]],
    ["file.remove", ["admin", "lead"]],
    ["equipment.outOfService", ["admin", "lead"]],
    ["breakdown.notRepairable", ["admin", "lead"]],
    ["team.manageEngineers", ["admin", "lead"]],
    ["team.manageLeadsAdmins", ["admin"]],
    ["settings.edit", ["admin"]],
  ];

  it("covers every action", () => {
    expect(table.map(([a]) => a).sort()).toEqual(Object.keys(permissions).sort());
  });

  for (const [action, allowed] of table) {
    it(`${action}: ${allowed.join(", ")}`, () => {
      for (const role of roles) expect(can(role, action)).toBe(allowed.includes(role));
    });
  }

  it("no role means no access", () => {
    expect(can(null, "view")).toBe(false);
  });

  it("Lead manages engineers and hospital staff; Admin manages everyone", () => {
    expect(canManagePerson("lead", "engineer")).toBe(true);
    expect(canManagePerson("lead", "staff")).toBe(true);
    expect(canManagePerson("lead", "lead")).toBe(false);
    expect(canManagePerson("lead", "admin")).toBe(false);
    expect(canManagePerson("admin", "lead")).toBe(true);
    expect(canManagePerson("engineer", "engineer")).toBe(false);
    expect(canManagePerson("staff", "staff")).toBe(false);
    expect(assignableRoles("lead")).toEqual(["engineer", "staff"]);
    expect(assignableRoles("engineer")).toEqual([]);
    expect(assignableRoles("staff")).toEqual([]);
  });
});

describe("phone numbers and WhatsApp", () => {
  it("splits and joins with the country code; old numbers get the default", () => {
    expect(splitPhone("+977 9812345678")).toEqual({ code: "+977", number: "9812345678" });
    expect(splitPhone("+919812345678")).toEqual({ code: "+91", number: "9812345678" });
    expect(splitPhone("9812345678")).toEqual({ code: "+977", number: "9812345678" });
    expect(splitPhone("9812345678", "+91")).toEqual({ code: "+91", number: "9812345678" });
    expect(joinPhone("+91", " 98123 45678 ")).toBe("+91 98123 45678");
    expect(joinPhone("+977", "")).toBe("");
  });

  it("builds wa.me links: digits only, no leading zero, message encoded", () => {
    expect(whatsAppNumber("+977 01-4412345")).toBe("97714412345");
    expect(whatsAppLink("+977 9812345678", "BD-0001 & help")).toBe("https://wa.me/9779812345678?text=BD-0001%20%26%20help");
    expect(whatsAppLink("123", "x")).toBeNull();
    expect(isCountryCode("+977")).toBe(true);
    expect(isCountryCode("977")).toBe(false);
  });
});

describe("PMS frequency in days, months or years", () => {
  it("counts from the start in the chosen unit", () => {
    expect(pmsSchedule("2026-01-01", "2026-01-31", 10, "days").map((v) => v.dueOn)).toEqual(["2026-01-11", "2026-01-21", "2026-01-31"]);
    expect(pmsSchedule("2026-01-31", "2026-06-30", 2, "months").map((v) => v.dueOn)).toEqual(["2026-03-31", "2026-05-31"]);
    expect(pmsSchedule("2024-02-29", "2028-03-01", 1, "years").map((v) => v.dueOn)).toEqual(["2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
    expect(pmsSchedule("2026-01-01", "2030-01-01", null, "days")).toEqual([]);
  });

  it("never makes more than the cap", () => {
    expect(pmsSchedule("2026-01-01", "2090-01-01", 1, "days")).toHaveLength(400);
  });
});

describe("dates", () => {
  it("a half-typed year (0002) is a date to the helpers but not a plausible one; nothing throws", () => {
    expect(parseAd("0002-08-01")).toEqual({ year: 2, month: 8, day: 1 });
    expect(addMonths("0002-08-01", 12)).toBe("3-08-01".padStart(10, "0"));
    expect(addDays("0099-12-31", 1)).toBe("100-01-01".padStart(10, "0"));
    expect(daysBetween("0002-08-01", "0002-08-11")).toBe(10);
    expect(isPlausibleDate("0002-08-01")).toBe(false);
    expect(isPlausibleDate("0202-08-01")).toBe(false);
    expect(isPlausibleDate("2024-08-01")).toBe(true);
    expect(isPlausibleDate("2024-02-30")).toBe(false);
  });

  it("today is the Nepal date (UTC+5:45)", () => {
    // 2026-11-27 18:20 UTC = 2026-11-28 00:05 in Nepal
    const ms = Date.UTC(2026, 10, 27, 18, 20);
    expect(todayNepal(ms)).toBe("2026-11-28");
    expect(nepalTime(ms)).toBe("00:05");
    expect(todayNepal(Date.UTC(2026, 10, 27, 18, 10))).toBe("2026-11-27");
  });

  it("converts AD and BS both ways", () => {
    expect(adToBs("2026-11-28")).toEqual({ year: 2083, month: 8, day: 12 });
    expect(bsToAd({ year: 2083, month: 8, day: 12 })).toBe("2026-11-28");
    expect(bsToAd({ year: 2083, month: 8, day: 40 })).toBeNull();
    expect(adToBs("2200-01-01")).toBeNull();
    expect(daysInBsMonth(2083, 8)).toBeGreaterThanOrEqual(29);
  });

  it("formats in the calendar chosen in Settings", () => {
    expect(formatDate("2026-11-28", "bs")).toBe("12 Mangsir 2083");
    expect(formatDate("2026-11-28", "ad")).toBe("28 Nov 2026");
    expect(formatMoment(Date.UTC(2026, 10, 28, 3, 30), "bs")).toBe("12 Mangsir 2083, 09:15");
    expect(formatMoment(Date.UTC(2026, 10, 28, 3, 30), "ad")).toBe("28 Nov 2026, 09:15");
    expect(formatDate("2200-01-01", "bs")).toBe("1 Jan 2200"); // outside the Nepali range: AD
  });

  it("adds months without drifting past month end", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(daysBetween("2026-11-01", "2026-11-28")).toBe(27);
  });

  it("splits durations into days and hours", () => {
    expect(durationParts(0, (4 * 24 + 3) * 3_600_000 + 59_000)).toEqual({ days: 4, hours: 3 });
  });
});

describe("PMS schedule", () => {
  it("every 3 months over one year gives 4 visits", () => {
    expect(pmsSchedule("2026-01-15", "2027-01-15", 3)).toEqual([
      { number: 1, dueOn: "2026-04-15" },
      { number: 2, dueOn: "2026-07-15" },
      { number: 3, dueOn: "2026-10-15" },
      { number: 4, dueOn: "2027-01-15" },
    ]);
  });

  it("stops before the end date and counts months from the start", () => {
    const s = pmsSchedule("2026-01-31", "2026-12-30", 1);
    expect(s).toHaveLength(10);
    expect(s[0]?.dueOn).toBe("2026-02-28");
    expect(s[1]?.dueOn).toBe("2026-03-31");
  });

  it("no PMS when not set", () => {
    expect(pmsSchedule("2026-01-01", "2027-01-01", null)).toEqual([]);
  });

  it("current coverage respects early end", () => {
    const c = { startsOn: "2026-01-01", endsOn: "2026-12-31", endedEarlyOn: "2026-06-30" };
    expect(isCoverageCurrent(c, "2026-06-30")).toBe(true);
    expect(isCoverageCurrent(c, "2026-07-01")).toBe(false);
    expect(coverageLastDay("2026-12-31", null)).toBe("2026-12-31");
    expect(rangesOverlap("2026-01-01", "2026-12-31", "2026-12-31", "2027-12-31")).toBe(true);
    expect(rangesOverlap("2026-01-01", "2026-12-30", "2026-12-31", "2027-12-31")).toBe(false);
  });
});

describe("keys", () => {
  it("serial key ignores case and spaces", () => {
    expect(serialKey(" askl 0093 ")).toBe(serialKey("ASKL0093"));
  });
  it("model key ignores case and extra spaces", () => {
    expect(modelKey(" Dräger ", "Savina  300")).toBe(modelKey("dräger", "savina 300"));
    expect(modelKey("A", "B")).not.toBe(modelKey("A", "C"));
  });
  it("breakdown numbers", () => {
    expect(breakdownNumber(42)).toBe("BD-0042");
  });
});

describe("csv", () => {
  it("round-trips quotes, commas and new lines", () => {
    const csv = toCsv(["a", "b"], [["x, y", 'say "hi"'], ["line\nbreak", ""]]);
    expect(parseCsv(csv)).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["line\nbreak", ""],
    ]);
  });
  it("guards against formulas", () => {
    expect(toCsv(["a"], [["=1+1"]])).toContain("'=1+1");
  });
});
