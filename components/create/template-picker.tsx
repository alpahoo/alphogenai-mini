"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search } from "lucide-react";
import {
  PROMPT_CATEGORIES,
  PROMPT_TEMPLATES,
  type PromptTemplate,
} from "@/lib/prompt-templates";

interface TemplatePickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (template: PromptTemplate) => void;
}

export function TemplatePicker({ open, onClose, onSelect }: TemplatePickerProps) {
  const [activeCategory, setActiveCategory] = useState<string>("cinematic");
  const [search, setSearch] = useState("");

  const filtered = PROMPT_TEMPLATES.filter((t) => {
    if (search) {
      const q = search.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        t.prompt.toLowerCase().includes(q)
      );
    }
    return t.category === activeCategory;
  });

  const handleSelect = (t: PromptTemplate) => {
    onSelect(t);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border/50 bg-card shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold">Prompt Templates</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Pick a proven prompt to get started
                </p>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search */}
            <div className="px-6 pt-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search templates..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-background/50 pl-9 pr-3 text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            {/* Categories */}
            {!search && (
              <div className="flex gap-2 overflow-x-auto px-6 pt-4">
                {PROMPT_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                      activeCategory === cat.id
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border/40 bg-muted/20 text-muted-foreground hover:border-border hover:text-foreground"
                    }`}
                  >
                    <span>{cat.emoji}</span>
                    {cat.label}
                  </button>
                ))}
              </div>
            )}

            {/* Templates grid */}
            <div className="max-h-[55vh] overflow-y-auto p-6">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">
                  No templates found
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {filtered.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleSelect(t)}
                      className="group rounded-xl border border-border/40 bg-card/50 p-4 text-left transition-all hover:border-primary/40 hover:bg-primary/5"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">{t.emoji}</span>
                        <h3 className="font-medium text-sm group-hover:text-primary">
                          {t.title}
                        </h3>
                        {t.duration && (
                          <span className="ml-auto text-[10px] text-muted-foreground">
                            {t.duration}s
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-3">
                        {t.prompt}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
