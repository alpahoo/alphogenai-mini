"use client";

/**
 * Isolated demo of the tokenized prompt composer (TipTap). Lets us validate the
 * editor UX + structured output BEFORE wiring it into the real Story Video page
 * (zero risk to production). Visit /create/composer-demo.
 */

import { useRef, useState } from "react";
import {
  PromptComposer,
  type PromptComposerHandle,
  type ComposerOutput,
  type MediaRefData,
} from "@/components/create/prompt-composer";

// Sample assets (in the real page these come from the user's verified faces +
// uploads).
const SAMPLE: MediaRefData[] = [
  {
    refType: "face",
    label: "Paul",
    assetId: "asset-20260607230638-229pt",
    provider: "byteplus",
    thumb: null,
  },
  {
    refType: "image",
    label: "woman",
    url: "https://example.com/woman.png",
    thumb: null,
  },
  { refType: "video", label: "street", url: "https://example.com/street.mp4", thumb: null },
  { refType: "style", label: "cyberpunk", url: "https://example.com/cyber.png", thumb: null },
];

export default function ComposerDemoPage() {
  const composer = useRef<PromptComposerHandle>(null);
  const [out, setOut] = useState<ComposerOutput>({ prompt: "", references: [] });

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Prompt Composer — demo</h1>
        <p className="text-sm text-muted-foreground/70">
          Type free text, insert media chips, and watch the structured output.
          Backspace deletes a chip. (Isolated test — not the production page.)
        </p>
      </div>

      <PromptComposer
        ref={composer}
        placeholder="Type @ to insert a face/image, or write freely…"
        onChange={setOut}
        suggestions={SAMPLE}
      />

      <div className="flex flex-wrap gap-2">
        {SAMPLE.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => composer.current?.insertRef(s)}
            className="rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 hover:bg-primary/5"
          >
            + Insert @{s.label} <span className="text-muted-foreground/50">({s.refType})</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => composer.current?.clear()}
          className="rounded-lg border border-border/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-destructive"
        >
          Clear
        </button>
      </div>

      <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
        <p className="text-xs font-semibold text-foreground mb-2">Structured output</p>
        <pre className="text-[11px] text-muted-foreground/80 whitespace-pre-wrap break-words">
          {JSON.stringify(out, null, 2)}
        </pre>
      </div>
    </div>
  );
}
