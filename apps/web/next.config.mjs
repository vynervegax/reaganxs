/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  images: {
    unoptimized: true,
  },

  // NOTE: with output:'export', these headers are IGNORED on Cloudflare Pages.
  // Set COOP/COEP in Cloudflare Pages → Settings → HTTP headers (or _headers file).
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
      ],
    },
  ],

  env: {
    NEXT_PUBLIC_BACKEND_URL:
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      'https://reaganxs-backend.up.railway.app',
    NEXT_PUBLIC_R2_PUBLIC_URL: process.env.NEXT_PUBLIC_R2_PUBLIC_URL,
    NEXT_PUBLIC_ORT_WASM_BASE:
      process.env.NEXT_PUBLIC_ORT_WASM_BASE ||
      'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/',
  },

  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Do not emit ort *.wasm into the Pages export (25 MiB limit)
      config.module.rules.push({
        test: /ort-wasm.*\.wasm$/,
        type: 'asset/resource',
        generator: { emit: false },
      });
    }
    return config;
  },
};

export default nextConfig;