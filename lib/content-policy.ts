/**
 * AlphoGen content policy — the SaaS's OWN consent + moderation layer, applied
 * BEFORE calling any generation provider (like HeyGen / EvoLink do).
 *
 * Two goals:
 *  1. Protect the platform: block clearly-infringing requests (named
 *     copyrighted IP / brands / public figures) up front.
 *  2. Reduce false moderation flags on LEGITIMATE original content by warning
 *     about phrasing that providers (Seedance etc.) treat as high-risk —
 *     age words and narrative/backstory language (per provider guidance).
 *
 * Pure functions: usable on the server (pre-screen at job creation) and the
 * client (live hints in the editor). Heuristic, not a substitute for the
 * provider's own moderation — it's AlphoGen's first line.
 */

export interface PolicyFinding {
  /** "block" = refuse before calling the provider; "warn" = allow but advise. */
  level: "block" | "warn";
  code: string;
  /** User-facing, actionable message. */
  message: string;
  /** The matched term(s), for highlighting. */
  matches?: string[];
}

export interface PolicyResult {
  blocked: boolean;
  findings: PolicyFinding[];
}

// ── Named copyrighted IP / franchises / brands (extensible) ────────────────
// Clear copyright/trademark risk → block. Curated, not exhaustive; the user
// remains responsible for their inputs.
const IP_BLOCKLIST: string[] = [
  "disney", "pixar", "marvel", "avengers", "spider-man", "spiderman", "iron man",
  "batman", "superman", "wonder woman", "dc comics", "star wars", "darth vader",
  "yoda", "jedi", "harry potter", "hogwarts", "pokemon", "pokémon", "pikachu",
  "mario", "super mario", "nintendo", "minecraft", "fortnite", "mickey mouse",
  "frozen", "elsa", "barbie", "hello kitty", "james bond", "james bond 007",
  "the simpsons", "spongebob", "naruto", "dragon ball", "one piece",
  "game of thrones", "harry potter", "lord of the rings", "gandalf",
  "coca-cola", "coca cola", "pepsi", "nike", "adidas", "louis vuitton", "gucci",
  "chanel", "rolex", "ferrari", "lamborghini",
];

// Generic markers that a real, named public figure is being depicted.
const PUBLIC_FIGURE_MARKERS: string[] = [
  "celebrity", "celebrities", "famous actor", "famous actress", "the president",
  "real politician", "pop star named", "the singer named",
];

// ── Age words → heightened provider scrutiny (warn, suggest roles) ─────────
const AGE_WORDS: string[] = [
  "child", "children", "kid", "kids", "toddler", "baby", "babies", "infant",
  "boy", "boys", "girl", "girls", "minor", "minors", "teen", "teens",
  "teenager", "teenagers", "underage", "schoolboy", "schoolgirl",
];

// ── Narrative/backstory words → flag risk; prefer visual/camera language ───
const NARRATIVE_MARKERS: string[] = [
  "backstory", "motivation", "years away", "years of absence", "returns home",
  "emotional confrontation", "relationship", "remembers", "flashback",
  "his past", "her past", "betrayal", "revenge",
];

function findMatches(text: string, terms: string[]): string[] {
  const lower = text.toLowerCase();
  const hits = new Set<string>();
  for (const term of terms) {
    // word-ish boundary match (handles hyphenated terms too)
    const re = new RegExp(`(?:^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^a-z0-9])`, "i");
    if (re.test(lower)) hits.add(term);
  }
  return [...hits];
}

/**
 * Screen a prompt against AlphoGen's content policy.
 * Returns blocking findings (refuse) and/or warnings (allow + advise).
 */
export function screenPrompt(prompt: string): PolicyResult {
  const findings: PolicyFinding[] = [];
  const text = prompt || "";

  const ip = findMatches(text, IP_BLOCKLIST);
  if (ip.length > 0) {
    findings.push({
      level: "block",
      code: "COPYRIGHTED_IP",
      message:
        `Your prompt references protected brands/characters (${ip.join(", ")}). ` +
        `Use generic, original descriptions instead.`,
      matches: ip,
    });
  }

  const figures = findMatches(text, PUBLIC_FIGURE_MARKERS);
  if (figures.length > 0) {
    findings.push({
      level: "block",
      code: "PUBLIC_FIGURE",
      message:
        `Depicting real public figures/celebrities isn't allowed. Describe an ` +
        `original character instead.`,
      matches: figures,
    });
  }

  const ages = findMatches(text, AGE_WORDS);
  if (ages.length > 0) {
    findings.push({
      level: "warn",
      code: "AGE_LANGUAGE",
      message:
        `Words like "${ages.join('", "')}" trigger stricter provider moderation. ` +
        `Use neutral character roles (e.g. "a student", "the family") instead.`,
      matches: ages,
    });
  }

  const narrative = findMatches(text, NARRATIVE_MARKERS);
  if (narrative.length >= 2) {
    findings.push({
      level: "warn",
      code: "NARRATIVE_STYLE",
      message:
        `Narrative/backstory phrasing raises flag risk. Describe only what the ` +
        `camera sees (setting, action, shot type, lighting), not motivations or history.`,
      matches: narrative,
    });
  }

  return { blocked: findings.some((f) => f.level === "block"), findings };
}
