import Link from "next/link";
import { ArrowLeft, CheckCircle2, ImagePlus, ShieldCheck, UserRound } from "lucide-react";

const STEPS = [
  {
    title: "Create or verify the face in your model console",
    body: "Use your approved real-person workflow to create a reusable face asset. AlphoGen only needs the resulting asset id.",
  },
  {
    title: "Copy the asset id",
    body: "The value usually starts with asset-. Keep the full id unchanged, including dashes and suffixes.",
  },
  {
    title: "Add it to My Faces",
    body: "Return to Create, open Assets, add a friendly name, paste the id, and attach a thumbnail photo for easy selection.",
  },
];

export default function VerifiedFaceIdHelpPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-10 text-foreground">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/create/story"
          className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Create
        </Link>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase text-primary">
            <ShieldCheck className="h-3.5 w-3.5" />
            Verified faces
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Find your verified face ID</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            A verified face ID lets AlphoGen reuse an approved person consistently across scenes. It is stored as hidden metadata; users select the face by name and thumbnail inside the Assets panel.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border/60 bg-background p-4">
              <UserRound className="mb-3 h-5 w-5 text-primary" />
              <p className="text-sm font-semibold">Face asset</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">A reusable, approved identity for generation.</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background p-4">
              <ImagePlus className="mb-3 h-5 w-5 text-violet-500" />
              <p className="text-sm font-semibold">Thumbnail</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Only for recognition in your private Assets panel.</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background p-4">
              <CheckCircle2 className="mb-3 h-5 w-5 text-emerald-500" />
              <p className="text-sm font-semibold">Private use</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Only your account can see and use your saved faces.</p>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Steps</h2>
          <div className="mt-4 space-y-4">
            {STEPS.map((step, index) => (
              <div key={step.title} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-sm font-bold text-foreground">{step.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
