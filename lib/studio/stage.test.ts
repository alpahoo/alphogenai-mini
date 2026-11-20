import { describe, expect, it } from "vitest";
import { financeView, stageView } from "./stage";

describe("Studio run stage", () => {
  it("separates reserved from sent to Modal", () => {
    expect(stageView({ status: "queued" }).label).toBe("Reserved");
    expect(stageView({ status: "queued", dispatched: false }).label).toBe("Reserved");
    expect(stageView({ status: "queued", dispatched: true }).label).toBe("Sent to Modal");
  });
  it("shows running, and whether the GPU call is confirmed", () => {
    expect(stageView({ status: "running" }).label).toBe("Running");
    expect(stageView({ status: "running" }).description).toMatch(/Waiting for the GPU call/);
    expect(stageView({ status: "running", executor_started: true }).description).toMatch(/confirmed/);
  });
  it("keeps the terminal states, including expired", () => {
    expect(stageView({ status: "expired" })).toMatchObject({ label: "Expired", tone: "danger" });
    expect(stageView({ status: "done" }).label).toBe("Completed");
    expect(stageView({ status: "failed" }).label).toBe("Failed");
  });
  it("labels billing without calling a reservation an invoice", () => {
    expect(financeView("awaiting_reconciliation")?.label).toBe("Billing to reconcile");
    expect(financeView("awaiting_reconciliation")?.description).toMatch(/not the invoiced cost/);
    expect(financeView("closed")?.label).toBe("Billing closed");
    expect(financeView(null)).toBeNull();
    expect(financeView("unknown")).toBeNull();
  });
});
