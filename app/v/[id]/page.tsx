import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function VideoPage({ params }: any) {
  const { data: job } = await supabase
    .from("jobs")
    .select()
    .eq("id", params.id)
    .single();

  if (!job)
    return <p className="text-center p-8">Video not found</p>;

  return (
    <main className="flex flex-col items-center p-6">
      <h1 className="text-2xl font-bold mb-4">🎥 Your Video</h1>
      {job.status === "done" ? (
        <video src={job.final_url} controls className="w-full max-w-md rounded" />
      ) : (
        <p>⏳ Video is being generated... Refresh in a few minutes.</p>
      )}
      <p className="mt-2 text-gray-500">{job.prompt}</p>
    </main>
  );
}