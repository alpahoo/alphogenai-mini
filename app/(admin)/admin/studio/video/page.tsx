import { VideoStudio } from "@/components/studio/video/video-studio";
import { requireAdminPage } from "@/lib/admin/require-admin-page";

export const metadata = { title: "Video · Studio · AlphoGen admin" };
// Per-request session check: never prerendered or cached.
export const dynamic = "force-dynamic";

/** Private admin Video screen. Admin role verified on the server before rendering; every data call is also guarded. */
export default async function StudioVideoPage() {
  await requireAdminPage();
  return <VideoStudio />;
}
