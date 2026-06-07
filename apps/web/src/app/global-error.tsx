'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-app items-center justify-center bg-canvas text-ink">
        <div className="text-center">
          <p className="text-lg font-semibold">Something went wrong.</p>
          <p className="mt-1 text-sm text-muted">Please refresh and try again.</p>
        </div>
      </body>
    </html>
  );
}
