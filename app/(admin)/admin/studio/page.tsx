import { Studio } from "@/components/studio/studio";
import { requireAdminPage } from "@/lib/admin/require-admin-page";

export const metadata = { title: "Studio · AlphoGen admin" };
// Per-request session check: never prerendered or cached.
export const dynamic = "force-dynamic";

/** Private admin Studio. Admin role verified on the server before rendering; every data call is also guarded. */
export default async function StudioPage() {
  await requireAdminPage();
  return <Studio />;
}
