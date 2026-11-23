import { redirect } from "next/navigation";

/** Legacy pilot URL. Kept so existing `?run=<id>` links open the same private run in the Studio. */
export default async function H3LegacyRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const run = (await searchParams).run;
  const query = new URLSearchParams({ model: "minimax-h3" });
  if (typeof run === "string" && /^[0-9a-f-]{36}$/i.test(run)) query.set("run", run);
  redirect(`/admin/studio?${query.toString()}`);
}
