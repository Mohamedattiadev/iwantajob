import { networkInterfaces } from "node:os";

export const dynamic = "force-dynamic";

// Returns the dev server's LAN IPv4 addresses so the iPad QR code links to a
// host the tablet can actually reach (instead of localhost).
export async function GET() {
  const nets = networkInterfaces();
  const addrs: string[] = [];
  for (const list of Object.values(nets)) {
    if (!list) continue;
    for (const n of list) {
      if (n.family !== "IPv4" || n.internal) continue;
      if (n.address.startsWith("169.254.")) continue; // link-local
      addrs.push(n.address);
    }
  }
  addrs.sort((a, b) => {
    const priv = (ip: string) =>
      ip.startsWith("192.168.") ? 0 :
      ip.startsWith("10.") ? 1 :
      ip.startsWith("172.") ? 2 : 3;
    return priv(a) - priv(b);
  });
  return Response.json({ lan: addrs });
}
