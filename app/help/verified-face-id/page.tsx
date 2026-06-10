import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ImagePlus,
  Lock,
  ShieldCheck,
  UserRound,
} from "lucide-react";

const STEPS = [
  {
    title: "Use an approved identity workflow",
    body: "Create or verify the person through the approved identity flow available to your account.",
  },
  {
    title: "Copy the verified face ID",
    body: "Keep the full ID unchanged. It is used as hidden metadata while the UI shows only your friendly name and thumbnail.",
  },
  {
    title: "Save it in My Faces",
    body: "Return to Create, open Assets, add a clear name, paste the ID, and attach a private thumbnail for recognition.",
  },
];

const NOTES = [
  {
    icon: UserRound,
    title: "Reusable identity",
    body: "A verified face lets you keep the same person across supported scenes.",
  },
  {
    icon: ImagePlus,
    title: "Private thumbnail",
    body: "The thumbnail is only for selection inside your Assets panel.",
  },
  {
    icon: Lock,
    title: "Account scoped",
    body: "Saved faces are scoped to your account and are not shown publicly.",
  },
];

export default function VerifiedFaceIdHelpPage() {
  return (
    <main className="min-h-screen bg-[#f4f1ea] text-neutral-950">
      <section className="border-b border-black/10 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
          <Link
            href="/create/story"
            className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 transition hover:text-neutral-950"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Create
          </Link>
          <span className="text-sm font-semibold">AlphoGen Help</span>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-12 lg:grid-cols-[0.85fr_1.15fr]">
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-[32px] bg-neutral-950 p-7 text-white shadow-2xl shadow-black/20">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <ShieldCheck className="h-5 w-5 text-[#baff3b]" />
            </div>
            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
              Verified faces
            </p>
            <h1 className="mt-4 text-5xl font-semibold leading-[0.95] tracking-tight">
              Find your verified face ID.
            </h1>
            <p className="mt-5 text-sm leading-7 text-white/65">
              A verified face ID lets AlphoGen reuse an approved person
              consistently where the selected model supports it.
            </p>
          </div>
        </aside>

        <div className="space-y-5">
          <section className="rounded-[32px] border border-black/10 bg-white p-6 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-3">
              {NOTES.map((note) => {
                const Icon = note.icon;
                return (
                  <div key={note.title} className="rounded-2xl bg-[#f4f1ea] p-4">
                    <Icon className="h-5 w-5 text-[#5f5bf6]" />
                    <p className="mt-4 text-sm font-semibold">{note.title}</p>
                    <p className="mt-2 text-xs leading-5 text-neutral-600">
                      {note.body}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-[32px] border border-black/10 bg-white p-6 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
              Steps
            </h2>
            <div className="mt-6 space-y-5">
              {STEPS.map((step, index) => (
                <div key={step.title} className="flex gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-sm font-semibold text-white">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-base font-semibold">{step.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-neutral-600">
                      {step.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[28px] border border-black/10 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-500" />
              <div>
                <h2 className="text-base font-semibold">
                  You do not need to expose the ID in prompts.
                </h2>
                <p className="mt-2 text-sm leading-7 text-neutral-600">
                  Once saved, choose the face from the Assets panel. AlphoGen
                  inserts the right hidden reference while your prompt stays
                  readable.
                </p>
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
