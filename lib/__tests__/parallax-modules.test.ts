import { describe, expect, it } from "vitest";
import { beforeEach, vi } from "vitest";

vi.mock("@/lib/flags", () => ({ isAdminEmail: (email?: string | null) => email === "admin@example.test" }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

import { PARALLAX_MODULES, defaultModuleStates, isParallaxModuleId, resolveModuleStates, sanitizeModes } from "@/lib/parallax-modules";
import { createServiceClient } from "@/lib/supabase/service";
import { getModuleStates, isModuleEnabled } from "@/lib/parallax-modules";

describe("parallax module registry", () => {
  it("keeps existing AlphoGenAI journeys on and Parallax journeys off by default", () => {
    const states = defaultModuleStates();
    expect(states.alphogenai_clipping).toBe(true);
    expect(states.alphogenai_podcast).toBe(true);
    expect(states.parallax_shorts).toBe(false);
    expect(states.parallax_audio).toBe(false);
    expect(states.parallax_remix).toBe(false);
  });

  it("accepts only registered module ids", () => {
    expect(isParallaxModuleId("parallax_shorts")).toBe(true);
    expect(isParallaxModuleId("providers")).toBe(false);
    expect(Object.keys(PARALLAX_MODULES)).toHaveLength(5);
  });
});

describe("administrator-only activation (first rollout)", () => {
  const admin = { email: "admin@example.test" };
  const someone = { email: "someone@example.test" };

  it("keeps booleans and learns the admin mode; anything else falls back to the default", () => {
    const modes = sanitizeModes({ parallax_shorts: "admin", parallax_audio: "yes", parallax_remix: true, alphogenai_clipping: false, providers: true });
    expect(modes.parallax_shorts).toBe("admin");
    expect(modes.parallax_audio).toBe(false);
    expect(modes.parallax_remix).toBe(true);
    expect(modes.alphogenai_clipping).toBe(false);
    expect(Object.keys(modes)).toHaveLength(5);
  });

  it("an admin-only module is on for an administrator and off for everybody else, including nobody", () => {
    const modes = sanitizeModes({ parallax_shorts: "admin", parallax_remix: true });
    expect(resolveModuleStates(modes, admin).parallax_shorts).toBe(true);
    expect(resolveModuleStates(modes, someone).parallax_shorts).toBe(false);
    expect(resolveModuleStates(modes, null).parallax_shorts).toBe(false);
    expect(resolveModuleStates(modes).parallax_shorts).toBe(false);
    expect(resolveModuleStates(modes, someone).parallax_remix).toBe(true);
    expect(resolveModuleStates(modes, admin).parallax_audio).toBe(false);
  });

  it("an administrator never gets a module that is off", () => {
    expect(resolveModuleStates(sanitizeModes({ parallax_audio: false }), admin).parallax_audio).toBe(false);
  });

  describe("reading the stored setting", () => {
    const store = (value: unknown, error: { code?: string } | null = null) => vi.mocked(createServiceClient).mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: value === undefined ? null : { value }, error }) }) }) }),
    } as never);
    beforeEach(() => vi.resetAllMocks());

    it("reads the admin mode per viewer", async () => {
      store({ parallax_shorts: "admin" });
      expect(await isModuleEnabled("parallax_shorts", admin)).toBe(true);
      expect(await isModuleEnabled("parallax_shorts", someone)).toBe(false);
      expect(await isModuleEnabled("parallax_shorts", null)).toBe(false);
    });

    it("no stored row means the defaults: Parallax off, the existing journeys on", async () => {
      store(undefined);
      const states = await getModuleStates(admin);
      expect([states.parallax_shorts, states.parallax_audio, states.parallax_remix]).toEqual([false, false, false]);
      expect([states.alphogenai_clipping, states.alphogenai_podcast]).toEqual([true, true]);
    });

    it("a storage failure falls back to the defaults and never turns a Parallax module on", async () => {
      vi.mocked(createServiceClient).mockImplementation(() => { throw new Error("boom"); });
      const states = await getModuleStates(admin);
      expect([states.parallax_shorts, states.parallax_audio, states.parallax_remix]).toEqual([false, false, false]);
    });
  });
});
