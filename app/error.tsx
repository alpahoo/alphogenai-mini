"use client";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html>
      <body>
        <div className="mx-auto max-w-xl p-6 text-center space-y-2">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="text-muted-foreground">An unexpected error occurred. Please try again.</p>
          {process.env.NODE_ENV !== "production" && error?.message ? (
            <pre className="text-xs mt-4 p-3 border rounded text-left overflow-auto">{error.message}</pre>
          ) : null}
        </div>
      </body>
    </html>
  );
}

