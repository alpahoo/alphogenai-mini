# Gallery Curation And Premium Redesign Spec

Date: 2026-06-09
Status: T-1001 proposal/spec, no runtime change

## Goal

Turn `alphogen.com/gallery` from an automatic job listing into a curated public
showcase controlled from admin.

The main product reason is trust: user generations can be private, sensitive,
unfinished, or simply not brand-safe. The public gallery must only show media that
an admin explicitly approves.

The second goal is positioning. The current gallery feels like a database grid. The
new page should feel closer to a premium creative AI showcase: large media, editorial
selection, confident spacing, and clear paths to create similar work.

## Current State

`app/gallery/page.tsx` currently:

- uses `createServiceClient()`,
- queries `jobs`,
- filters `status = done`,
- requires `output_url_final`,
- orders by `created_at desc`,
- displays up to 24 items,
- shows `prompt`, display model name, date, duration, thumbnail/video.

This is useful for a prototype but unsafe for production privacy because every
finished job can become public unless filtered elsewhere.

## Non-Negotiable Privacy Rule

Nothing appears on `/gallery` unless an admin explicitly publishes it.

Default state for every generated job:

```txt
private, not listed, not public-gallery eligible
```

The gallery should never infer publishability from job status alone.

## Proposed Data Model

Prefer a dedicated table instead of adding gallery columns to `jobs`.

```sql
create table public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  source_job_id uuid references public.jobs(id) on delete set null,
  media_type text not null check (media_type in ('video', 'image')),
  status text not null default 'draft' check (status in ('draft', 'published', 'hidden')),
  title text not null,
  subtitle text,
  public_prompt text,
  category text not null default 'cinematic',
  media_url text not null,
  thumbnail_url text,
  poster_url text,
  aspect_ratio text,
  duration_seconds integer,
  display_model text,
  sort_order integer not null default 0,
  featured boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
```

Notes:

- `public_prompt` is admin-written or sanitized. Do not publish raw private prompts
  by default.
- `display_model` must be provider-neutral and may be null.
- `source_job_id` enables `Create similar` / `Use as reference` later, but public
  gallery rendering should not need to read the private job.
- `featured` controls hero/editorial placement.
- `sort_order` controls manual order.

## RLS / Access Proposal

Gallery publishing is a public surface and should get its own RLS rules.

Suggested behavior:

- Public anon/select: only `status = 'published'`.
- Admin/select/write: only admins.
- Service-role: bypass for admin routes/server rendering.
- No direct public insert/update/delete.

Implementation should use a migration reviewed separately. Do not mix this with UI
work.

## Admin UX

Admin needs a clear Gallery Manager.

Potential routes:

- `/admin/gallery`
- `/admin/jobs` action: `Add to gallery`
- `/admin/jobs/[id]` or job detail action: `Publish to gallery`

Minimum V1 controls:

- list gallery items,
- search/filter by status/category,
- preview thumbnail/video,
- edit title/subtitle/public prompt/category,
- set `published`, `draft`, `hidden`,
- toggle `featured`,
- edit sort order,
- remove from gallery without deleting the source job.

Recommended categories:

- `Cinematic`
- `UGC`
- `Product`
- `Avatar`
- `Story`
- `Social`

Admin copy should be explicit:

- `Publish to gallery`
- `Unpublish`
- `Public title`
- `Public prompt`
- `Featured hero`

Avoid vague labels like `Visible` when privacy is involved.

## Public Gallery UX

### Direction

Blend two references:

- current clean AlphoGen grid: bright, calm, simple cards;
- Runway/SeeGen-like premium showcase: editorial hero, large media, dark/light
  contrast, strong creative positioning.

Recommended direction: a light editorial page with a cinematic hero and refined grid.
This keeps AlphoGen consistent with the current app while making the gallery feel
less like a raw template listing.

### Page Structure

1. Header

- AlphoGen logo,
- minimal nav,
- primary CTA: `Create your own`.

2. Hero Showcase

- one featured gallery item selected by admin,
- large full-width media block,
- overlay or adjacent editorial text,
- title, short subtitle, category chip,
- CTA: `Create similar` or `Start from this style`.

3. Category Filters

- `All`, `Cinematic`, `UGC`, `Product`, `Avatar`, `Story`, `Social`.
- Filters should not expose empty internal categories if there are no items.

4. Curated Grid

- bigger cards than today,
- consistent aspect ratios,
- hover video preview when available,
- short public title,
- category chip,
- optional public model/capability label, provider-neutral,
- no raw long prompts in card titles.

5. Detail Lightbox

- large video/image,
- public title/subtitle/prompt,
- category,
- duration/aspect,
- CTA: `Create similar`.

6. Bottom CTA

- premium creative CTA, not a marketing wall:
  `Describe a video. Direct it. Generate it.`

## Design Principles

- Use real media as the visual asset; avoid decorative gradients as the main event.
- Do not use cards inside cards.
- Keep cards at restrained radius.
- Make text short and editorial.
- Use generous whitespace and large media.
- Make first viewport instantly communicate what AlphoGen can generate.
- Avoid a dense, database-like gallery of truncated private prompts.

## Public Copy Examples

Hero:

```txt
Made with AlphoGen
Curated AI videos directed from prompts, references, looks, and social formats.
```

Card examples:

```txt
Paris cinematic character scene
Product demo for social launch
UGC creator outfit story
Avatar presenter intro
```

CTA:

```txt
Create your own
Start from this style
Open in Director
```

Avoid:

- provider names,
- raw internal engine keys,
- private prompts,
- claims like exact try-on or logo preservation unless validated.

## Create Similar / Use As Reference

V1 can link to the existing `reference_job_id` flow only when:

- `source_job_id` exists,
- source job is safe to expose,
- duplicate/reference contracts support the job type.

If not safe, the CTA should fall back to `/create/story` with no source payload.

Future V2:

- `Create similar` builds a safe payload from `public_prompt`, category, and optional
  source job metadata.
- `Use as reference` attaches the media as a role-labeled reference where supported.

## Migration / Implementation Slices

### T-1001 Spec

This document. No code/runtime change.

### T-1002 Gallery Schema

Create `gallery_items` with RLS and policies. No data backfill unless explicitly
approved.

### T-1003 Admin Gallery Manager

Admin-only CRUD for gallery items and publish/unpublish actions from existing jobs.

### T-1004 Public Gallery Redesign

Refactor `/gallery` to read only `gallery_items.status = published` and render the
premium showcase.

T-1004a delivered a privacy-first premium shell before the schema exists: `/gallery`
no longer reads from `jobs` automatically and instead shows curated showcase slots
that can later be backed by `gallery_items`.

### T-1005 Lightbox And Create Similar

Add detail/lightbox UX and safe `Create similar` behavior.

### T-1006 Visual QA

Use Browser/Playwright screenshots for:

- desktop gallery,
- mobile gallery,
- empty published gallery,
- hero media,
- hover/preview behavior,
- no provider/private prompt leaks.

## Acceptance Criteria

- Public gallery no longer reads directly from all finished jobs.
- Admin explicitly controls what is public.
- Private prompts and sensitive jobs are not exposed by default.
- Public UI has a premium editorial feel.
- Provider names remain hidden.
- Existing job generation, UGC, Director, duplicate, and reference flows are not
  broken.

## Open Questions

- Should published gallery media be copied to a dedicated public bucket/path, or is
  using existing public media URLs acceptable?
- Should `gallery_items` support externally uploaded showcase assets not tied to a
  job?
- Should public gallery include images immediately, or start with videos only?
- Should the admin be able to mark one item as the single hero, or multiple featured
  items with rank?
