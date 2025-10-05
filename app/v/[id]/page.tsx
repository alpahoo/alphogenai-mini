import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function VideoPage({ params }: PageProps) {
  const resolvedParams = await params;
  const { data: job } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", resolvedParams.id)
    .single();

  if (!job) {
    return <p className="text-center p-8">Video not found</p>;
  }

  return (
    <main className="flex flex-col items-center p-6">
      <h1 className="text-2xl font-bold mb-4">🎥 Your Video</h1>
      {job.status === "done" ? (
        <video 
          src={job.final_url} 
          controls 
          className="w-full max-w-md rounded"
          poster="/placeholder-video.jpg"
        >
          Your browser does not support the video tag.
        </video>
      ) : (
        <div className="text-center">
          <p className="mb-2">⏳ Video is being generated...</p>
          <p className="text-sm text-gray-500">
            Status: {job.status} {job.current_stage && `(${job.current_stage})`}
          </p>
          <p className="text-xs text-gray-400 mt-2">Refresh in a few minutes.</p>
        </div>
      )}
      <p className="mt-4 text-gray-500 text-center">{job.prompt}</p>
      {job.error_message && (
        <p className="mt-2 text-red-500 text-sm">Error: {job.error_message}</p>
      )}
    </main>
  );
}