import { describe, it, expect } from "vitest";
import { screenPrompt, screenPersonaName } from "@/lib/content-policy";

describe("screenPrompt — AlphoGen content policy", () => {
  it("blocks named copyrighted IP", () => {
    const r = screenPrompt("Spider-Man swinging between Disney castles");
    expect(r.blocked).toBe(true);
    expect(r.findings.some((f) => f.code === "COPYRIGHTED_IP")).toBe(true);
  });

  it("blocks explicit public-figure markers", () => {
    const r = screenPrompt("a scene with a famous actor playing the lead");
    expect(r.blocked).toBe(true);
    expect(r.findings.some((f) => f.code === "PUBLIC_FIGURE")).toBe(true);
  });

  it("warns (not blocks) on age words", () => {
    const r = screenPrompt("children laughing in a sunny park, wide shot");
    expect(r.blocked).toBe(false);
    expect(r.findings.some((f) => f.code === "AGE_LANGUAGE")).toBe(true);
  });

  it("warns on heavy narrative phrasing", () => {
    const r = screenPrompt(
      "she returns home after years of absence, an emotional confrontation about her past"
    );
    expect(r.blocked).toBe(false);
    expect(r.findings.some((f) => f.code === "NARRATIVE_STYLE")).toBe(true);
  });

  it("passes a clean cinematic prompt", () => {
    const r = screenPrompt(
      "wide shot, an older man on a wooden porch at golden hour, 35mm, warm rim light"
    );
    expect(r.blocked).toBe(false);
    expect(r.findings.length).toBe(0);
  });

  it("does not false-match substrings inside other words", () => {
    // "kid" must not match inside "skidding"
    const r = screenPrompt("a car skidding on a wet road, tracking shot");
    expect(r.findings.some((f) => f.code === "AGE_LANGUAGE")).toBe(false);
  });
});

describe("screenPersonaName — persona name policy (T-1136f)", () => {
  it("blocks a real public figure name", () => {
    const r = screenPersonaName("Elon Musk");
    expect(r.blocked).toBe(true);
    expect(r.findings.some((f) => f.code === "PUBLIC_FIGURE")).toBe(true);
  });

  it("blocks a copyrighted/branded character name", () => {
    const r = screenPersonaName("Mickey Mouse");
    expect(r.blocked).toBe(true);
    expect(r.findings.some((f) => f.code === "COPYRIGHTED_IP")).toBe(true);
  });

  it("blocks a figure name case-insensitively and within a longer name", () => {
    const r = screenPersonaName("Host: taylor swift vibes");
    expect(r.blocked).toBe(true);
  });

  it("allows an original fictional presenter name", () => {
    const r = screenPersonaName("Maya Rivers");
    expect(r.blocked).toBe(false);
    expect(r.findings.length).toBe(0);
  });

  it("does not false-match a substring inside an ordinary name", () => {
    // "ye" (Kanye alias) must not match inside "Yerevan" or "Skye".
    const r = screenPersonaName("Skye Anderson");
    expect(r.blocked).toBe(false);
  });
});
