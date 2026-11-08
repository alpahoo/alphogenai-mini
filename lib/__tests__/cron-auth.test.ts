import { describe, it, expect, afterEach } from "vitest";
import { assertCronAuth, isCronRequest } from "../cron-auth";

const original = process.env.CRON_SECRET;
afterEach(() => {
  if (original === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = original;
});

function req(auth?: string): Request {
  return new Request("https://x/api/cron/jogg-poll", auth ? { headers: { authorization: auth } } : undefined);
}

describe("assertCronAuth — FAIL-CLOSED", () => {
  it("refuses (401) when CRON_SECRET is missing", () => {
    delete process.env.CRON_SECRET;
    const r = assertCronAuth(req("Bearer whatever"));
    expect(r).not.toBeNull();
    expect(r!.status).toBe(401);
  });

  it("refuses (401) an incorrect secret", () => {
    process.env.CRON_SECRET = "s3cret";
    const r = assertCronAuth(req("Bearer nope"));
    expect(r?.status).toBe(401);
  });

  it("refuses (401) a missing Authorization header", () => {
    process.env.CRON_SECRET = "s3cret";
    const r = assertCronAuth(req());
    expect(r?.status).toBe(401);
  });

  it("authorizes (null) the correct secret", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(assertCronAuth(req("Bearer s3cret"))).toBeNull();
  });
});

describe("isCronRequest — FAIL-CLOSED boolean", () => {
  it("is false when CRON_SECRET is missing", () => {
    delete process.env.CRON_SECRET;
    expect(isCronRequest(req("Bearer "))).toBe(false);
    expect(isCronRequest(req("Bearer undefined"))).toBe(false);
  });

  it("is false for a wrong or missing bearer", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(isCronRequest(req("Bearer nope"))).toBe(false);
    expect(isCronRequest(req())).toBe(false);
  });

  it("is true only for the exact bearer", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(isCronRequest(req("Bearer s3cret"))).toBe(true);
  });
});
