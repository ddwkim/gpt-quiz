import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true
  },
  webpack: (config, { isServer }) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      // Exact-match alias so subpath imports (if any) still resolve to the real package
      dompurify$: path.resolve(__dirname, 'lib/shims/dompurify.ts')
    };
    return config;
  }
};

export default nextConfig;
