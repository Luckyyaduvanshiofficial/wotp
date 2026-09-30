import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'WA OTP — Open Source WhatsApp & Telegram OTP Gateway',
    short_name: 'WA OTP',
    description:
      'Lightning-fast open-source WhatsApp & Telegram OTP gateway built with FastAPI Python.',
    start_url: '/',
    display: 'standalone',
    background_color: '#05070D',
    theme_color: '#25D366',
    icons: [
      {
        src: '/favicon-32x32.png',
        sizes: '32x32',
        type: 'image/png'
      },
      {
        src: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png'
      },
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png'
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png'
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      }
    ]
  };
}
