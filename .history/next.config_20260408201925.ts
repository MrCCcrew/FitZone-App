import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    cpus: 2,
    workerThreads: false,
    experimental.proxyClientMaxBodySize
    middlewareClientMaxBodySize: "200mb",
  },
};

export default nextConfig;
