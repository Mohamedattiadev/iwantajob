"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

// One module-scoped client. `NEXT_PUBLIC_CONVEX_URL` is injected at build
// time via `npx convex dev` / Vercel env. If it is missing the client
// constructor will throw — surface a friendly hint in dev.
const url = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!url && process.env.NODE_ENV !== "production") {
  // eslint-disable-next-line no-console
  console.warn(
    "[convex] NEXT_PUBLIC_CONVEX_URL not set — run `npx convex dev` and copy it into .env.local",
  );
}
const convex = new ConvexReactClient(url ?? "https://placeholder.convex.cloud");

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthNextjsProvider client={convex}>
      {children}
    </ConvexAuthNextjsProvider>
  );
}
