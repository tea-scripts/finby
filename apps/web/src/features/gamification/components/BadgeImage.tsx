'use client';

import { useEffect, useState } from 'react';
import { getBadgeSvg } from '@/lib/gamification-api';

/** Renders an achievement badge SVG fetched with auth (the endpoint is
 *  bearer-protected, so a plain <img src> can't reach it). The SVG is wrapped in
 *  a blob URL so we keep normal <img> semantics (alt text, sizing). */
export function BadgeImage({
  workspaceId,
  slug,
  alt,
  className = '',
}: {
  workspaceId: string;
  slug: string;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    getBadgeSvg(workspaceId, slug)
      .then((svg) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        setUrl(objectUrl);
      })
      .catch(() => {
        /* leave the placeholder in place on failure */
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [workspaceId, slug]);

  if (!url) {
    return <div className={`animate-pulse rounded-xl bg-surface-2 ${className}`} aria-hidden="true" />;
  }
  // A blob-URL SVG (auth'd fetch) — next/image can't proxy it, so a plain img is intentional.
  return <img src={url} alt={alt} className={className} />;
}
