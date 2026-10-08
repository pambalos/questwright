import path from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@questwright/engine'],
  // A self-contained server build, which the desktop app runs locally.
  output: 'standalone',
  outputFileTracingRoot: path.join(process.cwd(), '../..'),
  // The app uses no image optimisation or runtime TypeScript; keep their binaries out of the desktop build.
  outputFileTracingExcludes: { '*': ['node_modules/@img/**', 'node_modules/sharp/**', 'node_modules/typescript/**'] },
  images: { unoptimized: true },
};

export default config;
