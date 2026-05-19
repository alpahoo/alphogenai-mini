"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Paintbrush,
  Palette,
  Type,
  Layout,
  MousePointer2,
  Save,
  Loader2,
  RotateCcw,
  Check,
  Image,
  Sun,
  Moon,
  Sparkles,
  Upload,
  Gift,
  Eye,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SiteConfig {
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

const DEFAULT_CONFIG: SiteConfig = {
  site_name: "AlphoGen",
  logo_url: "",
  color_primary: "239 84% 67%",
  color_background: "220 20% 97%",
  color_card: "0 0% 100%",
  color_border: "220 13% 89%",
  color_accent: "239 84% 67%",
  color_destructive: "0 84% 60%",
  color_muted: "220 14% 93%",
  color_muted_foreground: "220 9% 46%",
  dark_background: "224 18% 10%",
  dark_card: "224 16% 13%",
  dark_border: "224 14% 20%",
  font_heading: "Inter",
  font_body: "Inter",
  base_font_size: "16px",
  border_radius: "0.75rem",
  sidebar_width: "16rem",
  cta_style: "solid",
  button_radius: "0.75rem",
  referral_enabled: false,
};

// ---------------------------------------------------------------------------
// Preset Palettes
// ---------------------------------------------------------------------------
interface PalettePreset {
  name: string;
  preview: [string, string, string]; // 3 hex colors shown as dots
  colors: Partial<SiteConfig>;
}

const PRESET_PALETTES: PalettePreset[] = [
  {
    name: "AlphoGen",
    preview: ["#6366f1", "#eef0ff", "#818cf8"],
    colors: {
      color_primary: "239 84% 67%",
      color_background: "220 20% 97%",
      color_card: "0 0% 100%",
      color_border: "220 13% 89%",
      color_accent: "239 84% 67%",
      color_muted: "220 14% 93%",
      color_muted_foreground: "220 9% 46%",
      dark_background: "224 18% 10%",
      dark_card: "224 16% 13%",
      dark_border: "224 14% 20%",
    },
  },
  {
    name: "Ambré",
    preview: ["#f97316", "#fef7ed", "#fb923c"],
    colors: {
      color_primary: "25 95% 53%",
      color_background: "35 25% 97%",
      color_card: "0 0% 100%",
      color_border: "30 15% 88%",
      color_accent: "35 92% 50%",
      color_muted: "30 14% 93%",
      color_muted_foreground: "25 10% 46%",
      dark_background: "25 20% 10%",
      dark_card: "25 18% 13%",
      dark_border: "25 14% 20%",
    },
  },
  {
    name: "Émeraude",
    preview: ["#10b981", "#f0fdf7", "#34d399"],
    colors: {
      color_primary: "160 84% 39%",
      color_background: "150 20% 97%",
      color_card: "0 0% 100%",
      color_border: "155 13% 89%",
      color_accent: "145 80% 42%",
      color_muted: "150 14% 93%",
      color_muted_foreground: "155 9% 46%",
      dark_background: "160 20% 9%",
      dark_card: "160 18% 12%",
      dark_border: "160 14% 19%",
    },
  },
  {
    name: "Indigo",
    preview: ["#4f6df5", "#eef1ff", "#7c93f8"],
    colors: {
      color_primary: "226 70% 55%",
      color_background: "225 20% 97%",
      color_card: "0 0% 100%",
      color_border: "222 13% 89%",
      color_accent: "230 75% 60%",
      color_muted: "225 14% 93%",
      color_muted_foreground: "222 9% 46%",
      dark_background: "226 22% 10%",
      dark_card: "226 20% 13%",
      dark_border: "226 16% 20%",
    },
  },
  {
    name: "Rose",
    preview: ["#e11d6e", "#fef1f7", "#f472a8"],
    colors: {
      color_primary: "340 82% 52%",
      color_background: "345 20% 97%",
      color_card: "0 0% 100%",
      color_border: "340 13% 89%",
      color_accent: "330 85% 58%",
      color_muted: "340 14% 93%",
      color_muted_foreground: "340 9% 46%",
      dark_background: "340 20% 10%",
      dark_card: "340 18% 13%",
      dark_border: "340 14% 20%",
    },
  },
  {
    name: "Ardoise",
    preview: ["#64748b", "#f1f5f9", "#94a3b8"],
    colors: {
      color_primary: "215 16% 47%",
      color_background: "210 14% 96%",
      color_card: "0 0% 100%",
      color_border: "214 14% 89%",
      color_accent: "220 20% 55%",
      color_muted: "210 14% 93%",
      color_muted_foreground: "215 12% 50%",
      dark_background: "215 20% 10%",
      dark_card: "215 18% 13%",
      dark_border: "215 14% 20%",
    },
  },
  {
    name: "Océan",
    preview: ["#0ea5e9", "#f0f9ff", "#38bdf8"],
    colors: {
      color_primary: "199 89% 48%",
      color_background: "195 20% 97%",
      color_card: "0 0% 100%",
      color_border: "198 14% 89%",
      color_accent: "185 85% 45%",
      color_muted: "195 14% 93%",
      color_muted_foreground: "198 10% 46%",
      dark_background: "199 22% 10%",
      dark_card: "199 20% 13%",
      dark_border: "199 16% 20%",
    },
  },
  {
    name: "Crépuscule",
    preview: ["#a855f7", "#faf5ff", "#c084fc"],
    colors: {
      color_primary: "280 73% 55%",
      color_background: "270 15% 97%",
      color_card: "0 0% 100%",
      color_border: "275 12% 89%",
      color_accent: "300 70% 55%",
      color_muted: "270 14% 93%",
      color_muted_foreground: "275 10% 46%",
      dark_background: "280 22% 10%",
      dark_card: "280 20% 13%",
      dark_border: "280 16% 20%",
    },
  },
];

// ---------------------------------------------------------------------------
// Font & Radius Options
// ---------------------------------------------------------------------------
const FONT_OPTIONS = [
  "Inter",
  "Plus Jakarta Sans",
  "DM Sans",
  "Geist",
  "Manrope",
  "Outfit",
  "Poppins",
  "Nunito",
  "Lato",
  "Montserrat",
  "Raleway",
  "Open Sans",
  "Roboto",
  "Space Grotesk",
];

const RADIUS_STEPS = [
  { label: "None", value: "0", display: "0" },
  { label: "XS", value: "0.25rem", display: "4px" },
  { label: "SM", value: "0.375rem", display: "6px" },
  { label: "MD", value: "0.5rem", display: "8px" },
  { label: "Default", value: "0.75rem", display: "12px" },
  { label: "LG", value: "1rem", display: "16px" },
  { label: "XL", value: "1.25rem", display: "20px" },
  { label: "2XL", value: "1.5rem", display: "24px" },
  { label: "Full", value: "9999px", display: "Pill" },
];

const FONT_SIZE_OPTIONS = [
  { label: "Small", value: "14px" },
  { label: "Default", value: "16px" },
  { label: "Large", value: "18px" },
];

// ---------------------------------------------------------------------------
// HSL ↔ Hex converters
// ---------------------------------------------------------------------------
function hslStringToHex(hslStr: string): string {
  try {
    const parts = hslStr.trim().split(/\s+/);
    if (parts.length < 3) return "#6366f1";
    const h = parseFloat(parts[0]);
    const s = parseFloat(parts[1]) / 100;
    const l = parseFloat(parts[2]) / 100;

    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color)
        .toString(16)
        .padStart(2, "0");
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  } catch {
    return "#6366f1";
  }
}

function hexToHslString(hex: string): string {
  try {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return "239 84% 67%";

    const r = parseInt(result[1], 16) / 255;
    const g = parseInt(result[2], 16) / 255;
    const b = parseInt(result[3], 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0,
      s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
          break;
        case g:
          h = ((b - r) / d + 2) * 60;
          break;
        case b:
          h = ((r - g) / d + 4) * 60;
          break;
      }
    }

    return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  } catch {
    return "239 84% 67%";
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function ColorField({
  label,
  value,
  onChange,
  description,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  description?: string;
}) {
  const hex = hslStringToHex(value);

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="relative group">
          <div
            className="h-10 w-10 rounded-xl border-2 border-border/60 shadow-sm cursor-pointer transition-transform hover:scale-110"
            style={{ backgroundColor: hex }}
          />
          <input
            type="color"
            value={hex}
            onChange={(e) => onChange(hexToHslString(e.target.value))}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          {description && (
            <p className="text-xs text-muted-foreground/60 truncate">{description}</p>
          )}
        </div>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-40 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-mono text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        placeholder="H S% L%"
      />
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  description,
  children,
  iconColor,
}: {
  icon: typeof Palette;
  title: string;
  description: string;
  children: React.ReactNode;
  iconColor: string;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border/40 px-6 py-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconColor}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="px-6 py-5 space-y-4">{children}</div>
    </div>
  );
}

function RadiusSlider({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const idx = RADIUS_STEPS.findIndex((s) => s.value === value);
  const currentIdx = idx >= 0 ? idx : 4;
  const step = RADIUS_STEPS[currentIdx];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div
          className="h-14 w-14 border-2 border-primary/50 bg-primary/10 transition-all"
          style={{ borderRadius: value }}
        />
        <div>
          <p className="text-sm font-semibold">{step.label}</p>
          <p className="text-xs text-muted-foreground font-mono">{step.display}</p>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={RADIUS_STEPS.length - 1}
        step={1}
        value={currentIdx}
        onChange={(e) => onChange(RADIUS_STEPS[parseInt(e.target.value)].value)}
        className="w-full h-2 rounded-full appearance-none cursor-pointer accent-primary bg-muted"
      />
      <div className="flex justify-between text-[10px] text-muted-foreground/50 px-0.5">
        <span>Sharp</span>
        <span>Rounded</span>
        <span>Pill</span>
      </div>
    </div>
  );
}

function LivePreview({ config }: { config: SiteConfig }) {
  const primaryHex = hslStringToHex(config.color_primary);
  const bgHex = hslStringToHex(config.color_background);
  const cardHex = hslStringToHex(config.color_card);
  const borderHex = hslStringToHex(config.color_border);
  const mutedHex = hslStringToHex(config.color_muted);

  return (
    <div
      className="rounded-2xl border-2 border-border/50 overflow-hidden shadow-lg"
      style={{ backgroundColor: bgHex, fontFamily: `${config.font_body}, sans-serif` }}
    >
      {/* Mini header */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 border-b"
        style={{ borderColor: borderHex, backgroundColor: cardHex }}
      >
        {config.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={config.logo_url}
            alt="Logo"
            className="h-6 w-6 rounded-lg object-contain"
          />
        ) : (
          <div
            className="h-6 w-6 rounded-lg flex items-center justify-center text-white"
            style={{ backgroundColor: primaryHex }}
          >
            <Sparkles className="h-3 w-3" />
          </div>
        )}
        <span
          className="text-xs font-bold"
          style={{ fontFamily: `${config.font_heading}, sans-serif` }}
        >
          {config.site_name || "AlphoGen"}
        </span>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        <div
          className="p-3 border"
          style={{
            backgroundColor: cardHex,
            borderColor: borderHex,
            borderRadius: config.border_radius,
          }}
        >
          <div
            className="h-2 w-20 rounded-full mb-2"
            style={{ backgroundColor: primaryHex, opacity: 0.3 }}
          />
          <div className="h-2 w-32 rounded-full mb-1.5" style={{ backgroundColor: mutedHex }} />
          <div className="h-2 w-24 rounded-full" style={{ backgroundColor: mutedHex }} />
        </div>

        {/* Buttons preview */}
        <div className="flex gap-2">
          <button
            className="px-3 py-1.5 text-[10px] font-semibold text-white"
            style={{
              backgroundColor: config.cta_style === "gradient" ? undefined : primaryHex,
              background:
                config.cta_style === "gradient"
                  ? `linear-gradient(135deg, ${primaryHex}, ${hslStringToHex(config.color_accent)})`
                  : undefined,
              borderRadius: config.button_radius,
            }}
          >
            Primary Button
          </button>
          <button
            className="px-3 py-1.5 text-[10px] font-medium border"
            style={{
              borderColor: borderHex,
              backgroundColor: cardHex,
              borderRadius: config.button_radius,
            }}
          >
            Secondary
          </button>
        </div>

        {/* Input preview */}
        <div
          className="px-3 py-2 border text-[10px] text-gray-400"
          style={{
            borderColor: borderHex,
            backgroundColor: cardHex,
            borderRadius: config.border_radius,
          }}
        >
          Text input preview...
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function AdminTemplatePage() {
  const [config, setConfig] = useState<SiteConfig>(DEFAULT_CONFIG);
  const [originalConfig, setOriginalConfig] = useState<SiteConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"light" | "dark">("light");

  const isDirty = JSON.stringify(config) !== JSON.stringify(originalConfig);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/site-config");
      if (res.ok) {
        const data = await res.json();
        const merged = { ...DEFAULT_CONFIG, ...data };
        setConfig(merged);
        setOriginalConfig(merged);
      }
    } catch {
      /* keep defaults */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/site-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Save failed");
      }
      setOriginalConfig({ ...config });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfig({ ...DEFAULT_CONFIG });
  };

  const update = (key: keyof SiteConfig, value: string | boolean) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const applyPalette = (palette: PalettePreset) => {
    setConfig((prev) => ({ ...prev, ...palette.colors }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Find which palette matches current colors (if any)
  const activePalette = PRESET_PALETTES.find(
    (p) => p.colors.color_primary === config.color_primary && p.colors.color_accent === config.color_accent
  );

  return (
    <div className="px-8 py-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600">
            <Paintbrush className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Template Designer</h1>
            <p className="text-sm text-muted-foreground">
              Customize colors, fonts, and layout without touching code.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <Check className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? "Saving..." : saved ? "Saved!" : "Save changes"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {isDirty && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          You have unsaved changes.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* ── Left: Settings ──────────────────────────────── */}
        <div className="space-y-6">
          {/* ━━━ Preset Palettes ━━━ */}
          <Section
            icon={Palette}
            title="Color Palettes"
            description="Choose a preset theme or customize individual colors below"
            iconColor="bg-gradient-to-br from-pink-500/10 to-violet-500/10 text-pink-600"
          >
            <div className="grid grid-cols-4 gap-3">
              {PRESET_PALETTES.map((palette) => {
                const isActive = activePalette?.name === palette.name;
                return (
                  <button
                    key={palette.name}
                    type="button"
                    onClick={() => applyPalette(palette)}
                    className={`relative rounded-xl border p-3 text-center transition-all hover:shadow-md ${
                      isActive
                        ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                        : "border-border/60 bg-card hover:border-primary/30"
                    }`}
                  >
                    {isActive && (
                      <div className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}
                    <div className="flex justify-center gap-1.5 mb-2">
                      {palette.preview.map((color, i) => (
                        <div
                          key={i}
                          className="h-6 w-6 rounded-full border border-black/10 shadow-sm"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <p className="text-xs font-semibold">{palette.name}</p>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* ━━━ Brand ━━━ */}
          <Section
            icon={Image}
            title="Brand"
            description="Site name and logo"
            iconColor="bg-blue-500/10 text-blue-600"
          >
            <div>
              <label className="text-sm font-medium mb-1.5 block">Site name</label>
              <input
                type="text"
                value={config.site_name}
                onChange={(e) => update("site_name", e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="AlphoGen"
              />
            </div>

            {/* Logo section with preview */}
            <div>
              <label className="text-sm font-medium mb-2 block">Logo</label>
              <div className="flex gap-4">
                {/* Logo preview */}
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 overflow-hidden">
                  {config.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={config.logo_url}
                      alt="Logo preview"
                      className="h-full w-full object-contain p-1"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="text-center">
                      <Upload className="h-5 w-5 text-muted-foreground/40 mx-auto mb-1" />
                      <p className="text-[9px] text-muted-foreground/40">No logo</p>
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={config.logo_url}
                    onChange={(e) => update("logo_url", e.target.value)}
                    className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="https://example.com/logo.svg"
                  />
                  <p className="text-xs text-muted-foreground/60">
                    Paste an image URL (SVG, PNG, or JPG). Recommended: 200×200px or larger.
                  </p>
                  {config.logo_url && (
                    <button
                      type="button"
                      onClick={() => update("logo_url", "")}
                      className="text-xs text-destructive hover:underline"
                    >
                      Remove logo
                    </button>
                  )}
                </div>
              </div>
            </div>
          </Section>

          {/* ━━━ Colors ━━━ */}
          <Section
            icon={Eye}
            title="Colors"
            description="Fine-tune individual colors for light and dark modes"
            iconColor="bg-pink-500/10 text-pink-600"
          >
            {/* Light / Dark tab */}
            <div className="flex gap-1 rounded-xl border border-border/50 bg-muted/30 p-1 mb-2">
              <button
                onClick={() => setActiveTab("light")}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  activeTab === "light"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sun className="h-4 w-4" />
                Light mode
              </button>
              <button
                onClick={() => setActiveTab("dark")}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  activeTab === "dark"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Moon className="h-4 w-4" />
                Dark mode
              </button>
            </div>

            {activeTab === "light" ? (
              <div className="space-y-4">
                <ColorField
                  label="Primary"
                  value={config.color_primary}
                  onChange={(v) => update("color_primary", v)}
                  description="Buttons, links, active states"
                />
                <ColorField
                  label="Background"
                  value={config.color_background}
                  onChange={(v) => update("color_background", v)}
                  description="Page background"
                />
                <ColorField
                  label="Card"
                  value={config.color_card}
                  onChange={(v) => update("color_card", v)}
                  description="Card and panel backgrounds"
                />
                <ColorField
                  label="Border"
                  value={config.color_border}
                  onChange={(v) => update("color_border", v)}
                  description="Borders and dividers"
                />
                <ColorField
                  label="Accent"
                  value={config.color_accent}
                  onChange={(v) => update("color_accent", v)}
                  description="Highlights and accents"
                />
                <ColorField
                  label="Destructive"
                  value={config.color_destructive}
                  onChange={(v) => update("color_destructive", v)}
                  description="Errors and delete actions"
                />
                <ColorField
                  label="Muted"
                  value={config.color_muted}
                  onChange={(v) => update("color_muted", v)}
                  description="Subtle backgrounds"
                />
                <ColorField
                  label="Muted foreground"
                  value={config.color_muted_foreground}
                  onChange={(v) => update("color_muted_foreground", v)}
                  description="Secondary text"
                />
              </div>
            ) : (
              <div className="space-y-4">
                <ColorField
                  label="Background (dark)"
                  value={config.dark_background}
                  onChange={(v) => update("dark_background", v)}
                  description="Page background in dark mode"
                />
                <ColorField
                  label="Card (dark)"
                  value={config.dark_card}
                  onChange={(v) => update("dark_card", v)}
                  description="Card backgrounds in dark mode"
                />
                <ColorField
                  label="Border (dark)"
                  value={config.dark_border}
                  onChange={(v) => update("dark_border", v)}
                  description="Borders in dark mode"
                />
                <p className="text-xs text-muted-foreground/60">
                  Other dark mode colors are auto-calculated from the light mode values.
                </p>
              </div>
            )}
          </Section>

          {/* ━━━ Typography ━━━ */}
          <Section
            icon={Type}
            title="Typography"
            description="Fonts and text sizes"
            iconColor="bg-emerald-500/10 text-emerald-600"
          >
            <div>
              <label className="text-sm font-medium mb-1.5 block">Heading font</label>
              <select
                value={config.font_heading}
                onChange={(e) => update("font_heading", e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Body font</label>
              <select
                value={config.font_body}
                onChange={(e) => update("font_body", e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Base font size</label>
              <div className="flex gap-2">
                {FONT_SIZE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => update("base_font_size", opt.value)}
                    className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${
                      config.base_font_size === opt.value
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:border-border hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </Section>

          {/* ━━━ Layout ━━━ */}
          <Section
            icon={Layout}
            title="Layout"
            description="Border radius and spacing"
            iconColor="bg-amber-500/10 text-amber-600"
          >
            <div>
              <label className="text-sm font-medium mb-3 block">Border radius</label>
              <RadiusSlider
                value={config.border_radius}
                onChange={(v) => update("border_radius", v)}
              />
            </div>
          </Section>

          {/* ━━━ Buttons ━━━ */}
          <Section
            icon={MousePointer2}
            title="Buttons"
            description="CTA style and button corners"
            iconColor="bg-violet-500/10 text-violet-600"
          >
            <div>
              <label className="text-sm font-medium mb-2 block">CTA style</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => update("cta_style", "solid")}
                  className={`flex-1 rounded-xl border p-4 text-center transition-all ${
                    config.cta_style === "solid"
                      ? "border-primary/50 bg-primary/10"
                      : "border-border bg-card hover:border-border"
                  }`}
                >
                  <div
                    className="mx-auto mb-2 h-8 w-24 rounded-lg text-[10px] font-bold text-white flex items-center justify-center"
                    style={{ backgroundColor: hslStringToHex(config.color_primary) }}
                  >
                    Solid
                  </div>
                  <p className="text-xs font-medium">Solid color</p>
                </button>
                <button
                  type="button"
                  onClick={() => update("cta_style", "gradient")}
                  className={`flex-1 rounded-xl border p-4 text-center transition-all ${
                    config.cta_style === "gradient"
                      ? "border-primary/50 bg-primary/10"
                      : "border-border bg-card hover:border-border"
                  }`}
                >
                  <div
                    className="mx-auto mb-2 h-8 w-24 rounded-lg text-[10px] font-bold text-white flex items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg, ${hslStringToHex(config.color_primary)}, ${hslStringToHex(config.color_accent)})`,
                    }}
                  >
                    Gradient
                  </div>
                  <p className="text-xs font-medium">Gradient</p>
                </button>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-3 block">Button radius</label>
              <RadiusSlider
                value={config.button_radius}
                onChange={(v) => update("button_radius", v)}
              />
            </div>
          </Section>

          {/* ━━━ Features ━━━ */}
          <Section
            icon={Gift}
            title="Features"
            description="Enable or disable site-wide features"
            iconColor="bg-teal-500/10 text-teal-600"
          >
            {/* Referral Toggle */}
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600">
                  <Gift className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Refer a Friend</p>
                  <p className="text-xs text-muted-foreground">
                    Allow users to invite friends and earn rewards
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => update("referral_enabled", !config.referral_enabled)}
                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                  config.referral_enabled
                    ? "border-primary bg-primary"
                    : "border-border bg-muted"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    config.referral_enabled ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
            <p className="text-xs text-muted-foreground/60 px-1">
              When enabled, a referral section appears on the user dashboard where users can share
              their unique invite link.
            </p>
          </Section>
        </div>

        {/* ── Right: Live Preview ─────────────────────────── */}
        <div className="lg:sticky lg:top-8 self-start space-y-4">
          <div className="rounded-2xl border border-border/50 bg-card p-4 shadow-sm">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Live Preview
            </h3>
            <LivePreview config={config} />
          </div>

          <div className="rounded-2xl border border-border/50 bg-card p-4 shadow-sm">
            <h3 className="text-sm font-semibold mb-3">Quick info</h3>
            <div className="space-y-2 text-xs text-muted-foreground">
              <p>Changes are applied in real-time across the entire site after saving.</p>
              <p>
                Colors use HSL format:{" "}
                <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">Hue Sat% Light%</code>
              </p>
              <p>Select a preset palette or customize individual colors.</p>
              <p>Click &ldquo;Reset&rdquo; to restore the original AlphoGen theme.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
