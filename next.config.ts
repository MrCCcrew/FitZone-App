import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    cpus: 2,
    workerThreads: false,
  },
};

export default nextConfig;
