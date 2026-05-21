import type { NextConfig } from "next";

// Proxy API requests through the Next.js dev server to the FastAPI backend.
// iPad / other LAN devices hit `:3000` only, so the backend can stay bound
// to 127.0.0.1 and still be reachable from off-host clients. `afterFiles`
// runs after local route handlers (`/api/lan`, `/api/presence/*`) so those
// keep working without recursion.
const BACKEND = process.env.BACKEND_URL || "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [
        { source: "/api/:path*", destination: `${BACKEND}/api/:path*` },
      ],
      fallback: [],
    };
  },
};

export default nextConfig;
