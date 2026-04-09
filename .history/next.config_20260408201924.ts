import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    cpus: 2,
    workerThreads: false,
    
    middlewareClientMaxBodySize: "200mb",
  },
};

export default nextConfig;
