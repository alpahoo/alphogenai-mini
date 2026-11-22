# Cinema M1 — persistence preparation

Branch based on #114 (Cinema composer): Parallax reference `nickvasilescu/parallax@a98671e3c47fdb12c42789aee821268aa8f23f6c`, MIT notice preserved in `lib/cinema/LICENSE-parallax.txt`.

**DO NOT APPLY** `supabase/migrations/20261122_cinema_m1.sql` in production without the owner's approval. It creates five admin-private owner-scoped tables (projects, scenes, elements, shots, takes), RLS, explicit GRANTs and indexed storyboard order; the selected take is constrained to the same shot.

H3/MOSS gates, run/job rows, budget, reservation and media tables are unchanged. Takes point to existing `comfy_runs` and a selected take cannot refer to another shot. Exports will use the pre-existing `/api/admin/studio/montages` path (#116), with exactly the selected run IDs in storyboard order, corrected audio by default. Never copy or delete source files during export.

The Vitest migration checks are structural and **are not a real migration execution**. A test database (or approved Supabase preview branch) is required to validate all FK/RLS constraints and deployment before requesting production application.

The present helper exercises the existing Luz run prefixes with simulated completion sets; no real generation or export occurred.
