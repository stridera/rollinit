import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow socket.io to work with the custom server
  serverExternalPackages: ["socket.io"],
};

export default nextConfig;
