import { Studio } from "@/components/studio/studio";

export const metadata = { title: "Studio · AlphoGen admin" };

/** Private admin Studio. Every data call goes through `requireAdmin` API routes. */
export default function StudioPage() {
  return <Studio />;
}
