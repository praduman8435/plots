import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Photos uploaded on Vercel live in Vercel Blob (see src/server/storage.ts).
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com", pathname: "/plots/**" }],
  },
};

export default nextConfig;
