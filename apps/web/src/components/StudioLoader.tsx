'use client';

import dynamic from 'next/dynamic';

// The studio keeps the book in this browser and drives a rich-text editor, so it renders client-side only.
const Studio = dynamic(() => import('./Studio').then((m) => m.Studio), {
  ssr: false,
  loading: () => <p style={{ padding: 24 }}>Opening your book…</p>,
});

export function StudioLoader() {
  return <Studio />;
}
