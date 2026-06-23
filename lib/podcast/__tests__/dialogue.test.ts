import { describe, it, expect } from "vitest";
import {
  buildPodcastDialoguePrompt,
  parsePodcastDialogueResponse,
  normalizePodcastSegments,
  validatePodcastSegments,
  parseAndValidateDialogue,
  type DialogueSegment,
} from "../dialogue";

const goodSegments: DialogueSegment[] = [
  { speaker_role: "host", text: "Welcome to the show." },
  { speaker_role: "guest", text: "Glad to be here." },
  { speaker_role: "host", text: "Let's get into it." },
  { speaker_role: "guest", text: "Sounds great." },
  { speaker_role: "host", text: "First question." },
  { speaker_role: "guest", text: "Good one." },
];

function jsonWrap(segs: { speaker_role: string; text: string }[]) {
  return JSON.stringify({ segments: segs });
}

describe("buildPodcastDialoguePrompt", () => {
  it("includes topic, language and speaker names, and asks for strict JSON", () => {
    const p = buildPodcastDialoguePrompt({
      topic: "AI video tools",
      language: "fr-FR",
      hostName: "Maya",
      guestName: "Leo",
    });
    expect(p).toContain("AI video tools");
    expect(p).toContain("fr-FR");
    expect(p).toContain("Maya");
    expect(p).toContain("Leo");
    expect(p).toMatch(/JSON/i);
    expect(p).toContain("speaker_role");
  });

  it("includes target duration and style guidance when provided", () => {
    const p = buildPodcastDialoguePrompt({
      topic: "AI video tools",
      language: "en-US",
      targetDurationSeconds: 120,
      style: "debate",
      sourceUrl: "https://example.com/article",
    });
    expect(p).toContain("TARGET DURATION: about 120 seconds");
    expect(p).toContain("STYLE: balanced debate");
    expect(p).toContain("SOURCE URL: https://example.com/article");
  });

  it("sets a Jogg-like podcast quality bar instead of a flat Q&A prompt", () => {
    const p = buildPodcastDialoguePrompt({
      topic: "How creators automate AI videos",
      language: "en-US",
      targetDurationSeconds: 60,
      style: "expert",
    });
    expect(p).toContain("QUALITY BAR:");
    expect(p).toContain("sharp hook or framing question");
    expect(p).toContain("guest must have a distinct role");
    expect(p).toContain("mini arc: hook -> tension/question -> explanation -> concrete implication -> final takeaway");
    expect(p).toContain("Do not invent specific brands, statistics, dates, product claims, or source facts");
    expect(p).toContain("Avoid robotic Q&A");
  });
});

describe("parsePodcastDialogueResponse", () => {
  it("parses a bare wrapper object", () => {
    const out = parsePodcastDialogueResponse(jsonWrap(goodSegments));
    expect(out).toHaveLength(6);
  });

  it("parses a bare array", () => {
    const out = parsePodcastDialogueResponse(JSON.stringify(goodSegments));
    expect(out).toHaveLength(6);
  });

  it("strips ```json code fences", () => {
    const fenced = "```json\n" + jsonWrap(goodSegments) + "\n```";
    expect(parsePodcastDialogueResponse(fenced)).toHaveLength(6);
  });

  it("extracts a JSON object from surrounding prose", () => {
    const noisy = "Sure! Here you go:\n" + jsonWrap(goodSegments) + "\nHope that helps.";
    expect(parsePodcastDialogueResponse(noisy)).toHaveLength(6);
  });

  it("returns null for garbage", () => {
    expect(parsePodcastDialogueResponse("not json at all")).toBeNull();
    expect(parsePodcastDialogueResponse("")).toBeNull();
  });
});

describe("normalizePodcastSegments", () => {
  it("trims, collapses whitespace and keeps valid roles", () => {
    const out = normalizePodcastSegments([
      { speaker_role: "host", text: "  hello   world  " },
      { speaker_role: "guest", text: "hi" },
    ]);
    expect(out).toEqual([
      { speaker_role: "host", text: "hello world" },
      { speaker_role: "guest", text: "hi" },
    ]);
  });

  it("accepts alternate key spellings (role/line)", () => {
    const out = normalizePodcastSegments([
      { role: "host", line: "from role/line" },
    ] as unknown[]);
    expect(out).toEqual([{ speaker_role: "host", text: "from role/line" }]);
  });

  it("drops malformed / empty / unknown-role items", () => {
    const out = normalizePodcastSegments([
      { speaker_role: "host", text: "keep" },
      { speaker_role: "narrator", text: "drop" },
      { speaker_role: "guest", text: "   " },
      "nope",
      null,
    ] as unknown[]);
    expect(out).toEqual([{ speaker_role: "host", text: "keep" }]);
  });

  it("scrubs internal infra names but KEEPS public brands/models", () => {
    const out = normalizePodcastSegments([
      { speaker_role: "host", text: "Built on HeyGen, but we love OpenAI, Seedance and Kling." },
    ]);
    const t = out[0].text.toLowerCase();
    expect(t).not.toContain("heygen"); // internal infra → scrubbed
    expect(t).toContain("openai"); // public brand → kept
    expect(t).toContain("seedance"); // model that may be the topic → kept
    expect(t).toContain("kling"); // kept
  });

  it("keeps an internal name when the user's topic is about it", () => {
    const out = normalizePodcastSegments(
      [{ speaker_role: "host", text: "Today we review HeyGen in depth." }],
      { topic: "An honest HeyGen review" },
    );
    expect(out[0].text.toLowerCase()).toContain("heygen");
  });
});

describe("validatePodcastSegments", () => {
  it("accepts a well-formed 6-turn dialogue", () => {
    const r = validatePodcastSegments(goodSegments);
    expect(r.ok).toBe(true);
  });

  it("rejects too few turns", () => {
    const r = validatePodcastSegments(goodSegments.slice(0, 4));
    expect(r.ok).toBe(false);
  });

  it("rejects too many turns", () => {
    const many: DialogueSegment[] = Array.from({ length: 12 }, (_, i) => ({
      speaker_role: i % 2 === 0 ? "host" : "guest",
      text: `turn ${i}`,
    }));
    expect(validatePodcastSegments(many).ok).toBe(false);
  });

  it("rejects all-one-speaker dialogue", () => {
    const allHost = Array.from({ length: 6 }, (_, i) => ({
      speaker_role: "host" as const,
      text: `t${i}`,
    }));
    expect(validatePodcastSegments(allHost).ok).toBe(false);
  });

  it("rejects more than 2 consecutive turns by the same speaker", () => {
    // both speak 3 times (count check passes) but it's not alternating
    const blocky: DialogueSegment[] = [
      { speaker_role: "host", text: "a" },
      { speaker_role: "host", text: "b" },
      { speaker_role: "host", text: "c" },
      { speaker_role: "guest", text: "d" },
      { speaker_role: "guest", text: "e" },
      { speaker_role: "guest", text: "f" },
    ];
    expect(validatePodcastSegments(blocky).ok).toBe(false);
  });

  it("allows up to 2 consecutive turns by the same speaker", () => {
    const ok: DialogueSegment[] = [
      { speaker_role: "host", text: "a" },
      { speaker_role: "host", text: "b" },
      { speaker_role: "guest", text: "c" },
      { speaker_role: "guest", text: "d" },
      { speaker_role: "host", text: "e" },
      { speaker_role: "guest", text: "f" },
    ];
    expect(validatePodcastSegments(ok).ok).toBe(true);
  });
});

describe("parseAndValidateDialogue", () => {
  it("end-to-end on a fenced wrapper", () => {
    const r = parseAndValidateDialogue("```json\n" + jsonWrap(goodSegments) + "\n```");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.segments).toHaveLength(6);
  });

  it("fails on invalid JSON", () => {
    expect(parseAndValidateDialogue("garbage").ok).toBe(false);
  });

  it("fails when normalization drops it below the minimum", () => {
    const r = parseAndValidateDialogue(jsonWrap([
      { speaker_role: "host", text: "only one valid turn" },
    ]));
    expect(r.ok).toBe(false);
  });
});
