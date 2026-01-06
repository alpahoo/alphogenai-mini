'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function GeneratePage() {
  const router = useRouter();

  useEffect(() => {
    // Legacy route kept for backward compatibility.
    router.replace('/generate');
  }, [router]);
  
  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-zinc-600 dark:text-zinc-400">Redirection vers /generate...</p>
    </div>
  );
}
