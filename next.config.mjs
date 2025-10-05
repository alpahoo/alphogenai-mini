/** @type {import('next').NextConfig} */
const nextConfig = {
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
