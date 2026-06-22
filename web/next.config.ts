import type { NextConfig } from "next";

// Proxy API requests through the Next.js dev server to the FastAPI backend.
// iPad / other LAN devices hit `:3000` only, so the backend can stay bound
// to 127.0.0.1 and still be reachable from off-host clients. `afterFiles`
// runs after local route handlers (`/api/lan`, `/api/presence/*`) so those
// keep working without recursion.
const BACKEND = process.env.BACKEND_URL || "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  compress: true,
  productionBrowserSourceMaps: false,
  // Next 16 blocks cross-origin requests to /_next/* dev resources by
  // default — including from LAN clients like the iPad. Without this,
  // HMR + asset fetches from the tablet are blocked and the
  // approval-toast WS round-trip never reaches the user. Wildcard the
  // local /16 RFC1918 subnets so any LAN device works.
  allowedDevOrigins: [
    "10.*.*.*",
    "192.168.*.*",
    "172.16.*.*", "172.17.*.*", "172.18.*.*", "172.19.*.*",
    "172.20.*.*", "172.21.*.*", "172.22.*.*", "172.23.*.*",
    "172.24.*.*", "172.25.*.*", "172.26.*.*", "172.27.*.*",
    "172.28.*.*", "172.29.*.*", "172.30.*.*", "172.31.*.*",
  ],
  experimental: {
    optimizePackageImports: [
      "@base-ui/react",
      "@excalidraw/excalidraw",
      "lucide-react",
      "sonner",
      "@radix-ui/react-tooltip",
    ],
  },
  async rewrites() {
    // Dedicated `/be/api/*` prefix avoids colliding with Next.js route
    // handlers under `/api/*` (e.g. `/api/presence/[slug]`). Frontend
    // hits `/be/api/foo`; Next.js proxies → `${BACKEND}/api/foo`.
    return [
      { source: "/be/api/:path*", destination: `${BACKEND}/api/:path*` },
    ];
  },
  async redirects() {
    // Legacy `/scratch` URL kept working for bookmarks. New canonical
    // path is `/excalidraw`.
    return [
      { source: "/scratch", destination: "/excalidraw", permanent: true },
      { source: "/scratch/:path*", destination: "/excalidraw/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
