import { describe, expect, it } from "vitest";
import { daysBetween, expiringContracts, financialConsumption, isDelayed, overdueContracts, parseAmount, physicalProgress, plannedProgress, scheduleVariance } from "./projects";

describe("projects math", () => {
  it("weights physical progress and returns null with no milestones", () => {
    expect(physicalProgress([])).toBeNull();
    expect(physicalProgress([{ weight: 3, progress_pct: 100 }, { weight: 1, progress_pct: 0 }])).toBe(75);
    expect(physicalProgress([{ weight: "2", progress_pct: "50" }])).toBe(50);
  });
  it("planned progress prefers milestone plans, else straight line, else null", () => {
    const p = { start_on: "2026-01-01", due_on: "2026-01-11" };
    expect(plannedProgress([{ weight: 1, progress_pct: 0, planned_pct: 100 }, { weight: 1, progress_pct: 0, planned_pct: 0 }], p, "2026-01-02")).toBe(50);
    expect(plannedProgress([], p, "2026-01-06")).toBe(50);
    expect(plannedProgress([], p, "2026-03-01")).toBe(100);
    expect(plannedProgress([], { start_on: null, due_on: null }, "2026-01-06")).toBeNull();
  });
  it("financial consumption is null without budget and may exceed 100", () => {
    expect(financialConsumption(10, 0)).toBeNull();
    expect(financialConsumption(10, null)).toBeNull();
    expect(financialConsumption(25, 100)).toBe(25);
    expect(financialConsumption("150", "100")).toBe(150);
  });
  it("schedule variance", () => {
    expect(scheduleVariance(40, 60)).toBe(-20);
    expect(scheduleVariance(null, 60)).toBeNull();
  });
  it("delayed detection", () => {
    expect(isDelayed({ status: "active", due_on: "2026-11-01" }, "2026-11-25")).toBe(true);
    expect(isDelayed({ status: "completed", due_on: "2026-11-01" }, "2026-11-25")).toBe(false);
    expect(isDelayed({ status: "stopped", due_on: "2026-11-01" }, "2026-11-25")).toBe(false);
    expect(isDelayed({ status: "active", due_on: "2026-11-25" }, "2026-11-25")).toBe(false);
    expect(isDelayed({ status: "active", due_on: null }, "2026-11-25")).toBe(false);
  });
  it("expiring contracts within N days", () => {
    const cs = [{ id: 1, status: "active", end_on: "2026-12-10" }, { id: 2, status: "active", end_on: "2027-03-01" }, { id: 3, status: "draft", end_on: "2026-11-30" }, { id: 4, status: "signed", end_on: "2026-11-25" }, { id: 5, status: "active", end_on: "2026-11-01" }, { id: 6, status: "active", end_on: null }];
    expect(expiringContracts(cs, "2026-11-25", 30).map((c) => c.id)).toEqual([4, 1]);
    expect(overdueContracts(cs, "2026-11-25").map((c) => c.id)).toEqual([5]);
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
  });
  it("parses amounts", () => {
    expect(parseAmount("1,500.50")).toBe(1500.5);
    expect(parseAmount("٢٥٠")).toBe(250);
    expect(parseAmount("-5")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("1.234")).toBeNull();
  });
});
