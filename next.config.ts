import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'sgkjdtwqqbrpmrfukhja.supabase.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // Exclude Genkit AI packages from the server bundle — they use Node.js internals
  // incompatible with the Next.js Edge/Turbopack server runtime.
  serverExternalPackages: ['genkit', '@genkit-ai/google-genai', '@genkit-ai/googleai'],
};

export default nextConfig;
