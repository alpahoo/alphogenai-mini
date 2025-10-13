/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['lucide-react'],
  eslint: { 
    ignoreDuringBuilds: true 
  },
  typescript: { 
    ignoreBuildErrors: true 
  },
  webpack: (config) => {
    config.externals = [...(config.externals || []), { remotion: 'remotion' }];
    return config;
  },
};

export default nextConfig;
