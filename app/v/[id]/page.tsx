import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function VideoPage({ params }: PageProps) {
  const resolvedParams = await params;
  const jobId = resolvedParams.id;

  // Route legacy: on garde /v/[id] pour compat, mais le flow canonique est /jobs/[id].
  // /jobs/[id] gère l'auth et le polling via /api/jobs/[id].
  redirect(`/jobs/${jobId}`);
}
