# Cinema M1 — persistence preparation

Branch based on #114 (Cinema composer): Parallax reference `nickvasilescu/parallax@a98671e3c47fdb12c42789aee821268aa8f23f6c`, MIT notice preserved in `lib/cinema/LICENSE-parallax.txt`.

**DO NOT APPLY** `supabase/migrations/20261122_cinema_m1.sql` in production without the owner's approval. It creates five admin-private owner-scoped tables (projects, scenes, elements, shots, takes), RLS, explicit GRANTs and indexed storyboard order; the selected take is constrained to the same shot, and a take's run must belong to the same owner as the take (composite foreign key on `(run_id, user_id)`, enforced by the database for the service role too).

The only change to an existing table is one additive `UNIQUE (id, user_id)` on `public.comfy_runs` (a superset of its primary key, so the composite foreign key has a target). No data, gate, budget, reservation, job or media row changes. A run referenced by a take cannot be hard-deleted (`ON DELETE RESTRICT`); the Studio deletion keeps a tombstone row, so the take stays and reads as unavailable. Deleting a project removes its scenes, plans and takes and keeps every run.

Takes point to existing `comfy_runs`. Exports use the pre-existing `/api/admin/studio/montages` path (#116), with exactly the selected run IDs in storyboard order, corrected audio by default. Never copy or delete source files during export.

How it is verified:

* `tools/test-cinema-migration.mjs` (CI, in-memory PGlite): executes the migration and checks composite ownership (project, plan and run owner, also as the service role), the per-shot selection constraint, ordering uniqueness, optimistic versions, grants, owner RLS, the tombstone case and project deletion.
* `docs/cinema-m1-local-recipe.md`: the issue #117 scenario against a local Supabase stack, with a simulated dispatcher. It also documents the five historical migrations that fail on a blank database.
* Not verified yet: the hosted Supabase project, Vercel, a real render. See the recipe's scope section.
