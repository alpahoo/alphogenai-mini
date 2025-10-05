/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { 
    ignoreDuringBuilds: true 
  },
  // Optionnel: si TypeScript bloque un build en prod
  // typescript: { 
  //   ignoreBuildErrors: true 
  // },
};

export default nextConfig;
