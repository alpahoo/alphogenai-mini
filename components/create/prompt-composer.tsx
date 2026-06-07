"use client";

/**
 * Tokenized multimodal prompt editor (TipTap v3) — Higgsfield/Kling/Seedance
 * style. Free text + inline, non-editable media chips (@face / @image / @video
 * / @style). Backspace deletes a chip (atom node). Produces structured output:
 *   { prompt: "... image 1 ... image 2 ...", references: [{type,label,...,placeholder}] }
 *
 * v1: chips + serialization + imperative insert (panel/@-button driven).
 * The @-autocomplete popup is layered on next.
 */

import { forwardRef, useImperativeHandle, useRef } from "react";
import {
  useEditor,
  EditorContent,
  ReactNodeViewRenderer,
  NodeViewWrapper,
  type NodeViewProps,
  type Editor,
} from "@tiptap/react";
import { Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { X } from "lucide-react";

export type MediaRefType = "face" | "image" | "video" | "style";

export interface MediaRefData {
  refType: MediaRefType;
  label: string;
  assetId?: string | null; // BytePlus verified asset id (faces)
  url?: string | null; // uploaded media url (non-BytePlus / objects / styles)
  provider?: string | null; // e.g. "byteplus"
  thumb?: string | null; // thumbnail for the chip
}

export interface ComposerReference extends MediaRefData {
  /** Provider-facing placeholder used in the prompt text: "image 1", "video 1". */
  placeholder: string;
}

export interface ComposerOutput {
  prompt: string;
  references: ComposerReference[];
}

export interface PromptComposerHandle {
  insertRef: (data: MediaRefData) => void;
  focus: () => void;
  clear: () => void;
}

const TYPE_STYLES: Record<MediaRefType, string> = {
  face: "bg-primary/15 text-primary border-primary/30",
  image: "bg-violet-500/15 text-violet-500 border-violet-500/30",
  video: "bg-sky-500/15 text-sky-500 border-sky-500/30",
  style: "bg-amber-500/15 text-amber-600 border-amber-500/30",
};

/** React node view: the visual chip. */
function ChipView({ node, deleteNode }: NodeViewProps) {
  const a = node.attrs as MediaRefData;
  return (
    <NodeViewWrapper
      as="span"
      className={`inline-flex items-center gap-1 align-baseline rounded-md border px-1.5 py-0.5 mx-0.5 text-[12px] font-medium select-none ${
        TYPE_STYLES[a.refType] ?? TYPE_STYLES.image
      }`}
      contentEditable={false}
      data-drag-handle
    >
      {a.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.thumb} alt="" className="h-4 w-4 rounded-sm object-cover" />
      ) : null}
      <span>@{a.label}</span>
      <button
        type="button"
        onClick={() => deleteNode()}
        className="opacity-60 hover:opacity-100"
        aria-label="Remove reference"
      >
        <X className="h-3 w-3" />
      </button>
    </NodeViewWrapper>
  );
}

/** Inline atom node holding the media reference metadata. */
const MediaRef = Node.create({
  name: "mediaRef",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      refType: { default: "image" },
      label: { default: "" },
      assetId: { default: null },
      url: { default: null },
      provider: { default: null },
      thumb: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-media-ref]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes({ "data-media-ref": "true" }, HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChipView);
  },
});

/** Serialize the editor doc → { prompt, references }. */
function serialize(editor: Editor): ComposerOutput {
  const references: ComposerReference[] = [];
  const counters: Record<string, number> = { image: 0, video: 0 };
  const lines: string[] = [];

  editor.state.doc.forEach((block) => {
    let line = "";
    block.forEach((inline) => {
      if (inline.isText) {
        line += inline.text ?? "";
      } else if (inline.type.name === "mediaRef") {
        const a = inline.attrs as MediaRefData;
        // face / image / style all map to "image N"; video → "video N".
        const kind = a.refType === "video" ? "video" : "image";
        counters[kind] += 1;
        const placeholder = `${kind} ${counters[kind]}`;
        line += placeholder;
        references.push({ ...a, placeholder });
      }
    });
    lines.push(line);
  });

  return { prompt: lines.join("\n").trim(), references };
}

interface PromptComposerProps {
  placeholder?: string;
  onChange?: (out: ComposerOutput) => void;
}

export const PromptComposer = forwardRef<PromptComposerHandle, PromptComposerProps>(
  function PromptComposer({ placeholder, onChange }, ref) {
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const editor = useEditor({
      // Next.js SSR: avoid hydration mismatch.
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          heading: false,
          bulletList: false,
          orderedList: false,
          blockquote: false,
          codeBlock: false,
          horizontalRule: false,
        }),
        MediaRef,
      ],
      editorProps: {
        attributes: {
          class:
            "min-h-[120px] w-full px-4 py-3 text-sm text-foreground focus:outline-none [&_p]:my-0",
          "data-placeholder": placeholder ?? "Describe your video…",
        },
      },
      onUpdate: ({ editor }) => {
        onChangeRef.current?.(serialize(editor as Editor));
      },
    });

    useImperativeHandle(ref, () => ({
      insertRef: (data: MediaRefData) => {
        if (!editor) return;
        editor
          .chain()
          .focus()
          .insertContent([
            { type: "mediaRef", attrs: data },
            { type: "text", text: " " },
          ])
          .run();
      },
      focus: () => editor?.chain().focus().run(),
      clear: () => editor?.commands.clearContent(true),
    }));

    return (
      <div className="rounded-xl border border-border/50 bg-background focus-within:border-primary/40 transition-colors">
        <EditorContent editor={editor} />
      </div>
    );
  }
);
