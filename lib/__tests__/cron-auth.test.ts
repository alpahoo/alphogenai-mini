import { describe, it, expect, afterEach } from "vitest";
import { assertCronAuth } from "../cron-auth";

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
