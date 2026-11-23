import { AvatarStudio } from "@/components/studio/avatar/avatar-studio";
import { requireAdminPage } from "@/lib/admin/require-admin-page";

export const metadata = { title: "Talking avatar · AlphoGen admin" };
// Per-request session check: never prerendered or cached.
export const dynamic = "force-dynamic";

/** Private admin talking-avatar screen. Admin role verified on the server before rendering; every data call is also guarded. */
export default async function AvatarStudioPage() {
  await requireAdminPage();
  return <AvatarStudio />;
}
