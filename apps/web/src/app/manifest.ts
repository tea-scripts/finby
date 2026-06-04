import type { MetadataRoute } from 'next';

/** Web app manifest — makes Finby installable. Next serves this at
 *  /manifest.webmanifest and auto-injects the <link rel="manifest">. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Finby — your money, your buddy',
    short_name: 'Finby',
    description:
      'Conversational personal finance. Log expenses, track budgets, and get honest guidance — just by chatting.',
    start_url: '/chat',
    scope: '/',
    display: 'standalone',
    background_color: '#06101f',
    theme_color: '#06101f',
    orientation: 'portrait',
    categories: ['finance', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
