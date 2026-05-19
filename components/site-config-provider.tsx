"use client";

import { useEffect, useState, createContext, useContext } from "react";

interface SiteConfigData {
  site_name: string;
  logo_url: string;
  color_primary: string;
  color_background: string;
  color_card: string;
  color_border: string;
  color_accent: string;
  color_destructive: string;
  color_muted: string;
  color_muted_foreground: string;
  dark_background: string;
  dark_card: string;
  dark_border: string;
  font_heading: string;
  font_body: string;
  base_font_size: string;
  border_radius: string;
  sidebar_width: string;
  cta_style: "solid" | "gradient";
  button_radius: string;
  referral_enabled: boolean;
}

const SiteConfigContext = createContext<SiteConfigData | null>(null);

export function useSiteConfig() {
  return useContext(SiteConfigContext);
}

/**
 * Fetches /api/admin/site-config on mount and injects the custom CSS
 * variables onto the <html> element. Falls back silently to the
 * defaults in globals.css if the fetch fails.
 */
export function SiteConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<SiteConfigData | null>(null);

  useEffect(() => {
    let mounted = true;

    fetch("/api/admin/site-config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: SiteConfigData | null) => {
        if (!mounted || !data) return;
        setConfig(data);
        applyConfig(data);
      })
      .catch(() => {
        /* silent — globals.css defaults are fine */
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <SiteConfigContext.Provider value={config}>
      {children}
    </SiteConfigContext.Provider>
  );
}

// ── Apply config as CSS custom properties ────────────────────
function applyConfig(cfg: SiteConfigData) {
  const root = document.documentElement;

  // Only override values that differ from the defaults
  // (prevents needless reflows when the admin hasn't changed anything)
  const lightVars: Record<string, string> = {
    "--primary": cfg.color_primary,
    "--background": cfg.color_background,
    "--card": cfg.color_card,
    "--border": cfg.color_border,
    "--input": cfg.color_border,
    "--ring": cfg.color_primary,
    "--accent": cfg.color_accent,
    "--accent-foreground": "0 0% 100%",
    "--destructive": cfg.color_destructive,
    "--muted": cfg.color_muted,
    "--muted-foreground": cfg.color_muted_foreground,
    "--radius": cfg.border_radius,
  };

  // Apply light mode vars directly on :root
  for (const [prop, val] of Object.entries(lightVars)) {
    if (val) root.style.setProperty(prop, val);
  }

  // Apply dark mode overrides via a <style> tag
  const darkVars = [
    `--background: ${cfg.dark_background}`,
    `--card: ${cfg.dark_card}`,
    `--popover: ${cfg.dark_card}`,
    `--border: ${cfg.dark_border}`,
    `--input: ${cfg.dark_border}`,
  ]
    .filter(Boolean)
    .join("; ");

  let styleEl = document.getElementById("site-config-dark");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "site-config-dark";
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `.dark { ${darkVars} }`;

  // Font family
  if (cfg.font_body) {
    root.style.setProperty("--font-body", cfg.font_body);
    document.body.style.fontFamily = `${cfg.font_body}, system-ui, sans-serif`;
  }

  // Base font size
  if (cfg.base_font_size) {
    root.style.fontSize = cfg.base_font_size;
  }
}
