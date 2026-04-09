import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    cpus: 2,
    workerThreads: false,
    proxyClientMaxBodySize: "200mb",
    middlewareClientMaxBodySize: "200mb",
  },
};

export default nextConfig;
