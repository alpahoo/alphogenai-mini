# Premium Product Experience Spec

Date: 2026-06-10  
Owner: Codex  
Status: T-1101 done, implementation phased

## Goal

Bring the whole AlphoGen experience to the same premium level as the curated gallery.
The product should feel less like a template SaaS and more like an AI video direction
studio: editorial, media-led, controlled, and private by default.

## Design Direction

The visual direction blends two references:

- Runway-like: restrained editorial layout, large media surfaces, minimal chrome,
  sharp hierarchy, confident whitespace.
- Director-console energy: darker technical panels used sparingly, capability readouts,
  clear controls, no fake spectacle.

This should not become a one-note dark neon product. The default surface stays light,
warm-neutral and readable. Dark blocks are reserved for media previews, hero sequences,
and high-confidence product moments.

## Shared Principles

1. Media first
   - Every public or premium product page needs a strong media surface: video preview,
     curated showcase, storyboard panel, or asset grid.
   - Avoid abstract SVG/gradient-only hero sections.

2. Command, not configuration
   - Pages should present workflows: Direct, Generate, Reuse, Export.
   - Avoid exposing users to provider-like controls or dense technical forms as the
     first impression.

3. Privacy and control
   - Gallery and public surfaces show only explicitly curated content.
   - Prompts shown publicly are public copy, never raw private prompts.
   - Provider names remain confidential outside admin/log contexts.

4. Stable workspace
   - Workspace pages should evolve incrementally. Do not rewrite data flow or routes
     for visual polish.
   - Prefer reusable primitives over one-off page styling.

5. Dense but calm app UI
   - Workspace surfaces can be information-dense, but should use grouped command panels,
     media previews, and compact status readouts rather than nested cards.

## Visual Language

- Backgrounds: off-white / warm-neutral public pages; clean white panels; dark media
  canvases for hero previews.
- Radius: 8px or less for cards/panels unless matching existing app controls.
- Buttons: icon + short command. Primary actions should be direct verbs.
- Typography: large editorial headings only in true hero/public surfaces. Compact panels
  use smaller headings.
- Accents: AlphoGen primary violet remains, but secondary accents should vary by domain
  (product green, cinematic amber, UGC rose, social lime) and stay restrained.
- Layout: avoid decorative floating cards inside cards. Use bands, grids, rails, and
  full-width sections with constrained inner content.

## Target Pages

### T-1102 Shared primitives

Create reusable marketing/product primitives:

- `PremiumHero`
- `PremiumMediaFrame`
- `PremiumSectionHeader`
- `PremiumWorkflowCard`
- `PremiumMetricStrip`

These are UI-only and should not import app data or Supabase.

### T-1103 Landing rebuild

Replace the generic landing with an editorial product story:

- Hero: "Direct AI video like a production studio" with a large media/director console
  surface.
- Proof row: Director plan, references, social pack, curated gallery.
- Workflow sections: Create from prompt, UGC/product, post-generation studio.
- Gallery CTA: link to curated gallery.
- Privacy copy: private by default, curated when published by admin.

### T-1104 Home command center V2

Workspace home should become a real command center, not only a template picker:

- Continue recent work.
- Start Director / UGC / Reference workflows.
- Production pulse.
- Recent assets/jobs.

### T-1105 Create flow visual polish

Make the create flow feel like the Director Console:

- Stronger hierarchy around prompt + references + Director.
- UGC readiness and assets should read as a coherent production setup.
- Keep existing submit paths unchanged.

### T-1106 Job studio polish

Make completed jobs feel like a post-generation studio:

- Large media surface.
- Scene timeline and social pack visible without clutter.
- Clear actions: Reference, Duplicate, Export, Save Look.

### T-1107 Secondary workspace pass

Library, Projects, Analytics, Schedule should share the same primitives and spacing.

### T-1108 Visual QA

For each page pass:

- Desktop and mobile screenshots.
- Check no provider names leak.
- Check no text overflow.
- Check auth-gated pages still redirect without session.

## Non-goals

- No DB/schema/API changes for pure design work.
- No provider/routing changes.
- No broad rewrite of the workspace shell in one pass.
- No automatic gallery publication or private job exposure.

## Recommended sequence

1. T-1101 spec (this document).
2. T-1102 primitives.
3. T-1103 landing rebuild.
4. T-1105 create flow polish.
5. T-1106 job studio polish.
6. T-1104 / T-1107 workspace consistency passes.
