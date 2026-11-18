import type { MetadataRoute } from 'next';

/** Install Bloomgard CMA to a phone's home screen or a desktop dock: it opens like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Bloomgard CMA',
    short_name: 'Bloomgard',
    description: 'Your sales desk, run by AI: quotes, inbox, follow-ups and the OK list.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#fffefc',
    theme_color: '#0b0e1a',
    icons: [
      { src: '/brand/app-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/app-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/brand/app-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'OK list', url: '/dashboard?view=tasks' },
      { name: 'New quote', url: '/dashboard?view=new_entry' },
    ],
  };
}
