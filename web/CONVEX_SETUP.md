# Convex bootstrap — manual steps

This repo has Convex + `@convex-dev/auth` wired up but no deployment yet. To
finish the bring-up:

1. **Create a Convex deployment**
   ```sh
   cd web
   npx convex dev
   ```
   This prompts a browser login and creates a new project. It writes
   `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` into `.env.local`.

2. **Resend (for OTP emails)**
   - Sign up at https://resend.com, create an API key.
   - Push it to the Convex deployment env (NOT `.env.local` — auth runs on
     the Convex side):
     ```sh
     npx convex env set AUTH_RESEND_KEY re_xxx
     # optional, default is "IWANTAJOB <noreply@iwantajob.app>"
     npx convex env set AUTH_EMAIL_FROM "W/ORK <noreply@your-domain>"
     ```

3. **Google OAuth**
   - Google Cloud Console → APIs & Services → Credentials → "OAuth client ID"
     → Web application.
   - Add authorized redirect URIs:
     - `http://localhost:3000/api/auth/callback/google` (dev)
     - `https://YOUR_DOMAIN/api/auth/callback/google` (prod)
   - Push the creds to Convex env:
     ```sh
     npx convex env set AUTH_GOOGLE_ID xxx.apps.googleusercontent.com
     npx convex env set AUTH_GOOGLE_SECRET GOCSPX-xxx
     ```

4. **`SITE_URL` (for the OAuth callback)**
   ```sh
   npx convex env set SITE_URL http://localhost:3000
   ```

5. **Verify**
   ```sh
   cd web
   npm run build
   ```
   Build should pass. Then `npm run dev`, visit `/login`, and try both
   password+OTP and Google.

## Migration status

- FastAPI app under `scraper/` is untouched and still serves `/be/api/*`
  (proxied through Next.js `rewrites`) plus any direct `/api/*` route
  handlers.
- Convex schema in `convex/schema.ts` mirrors the existing per-user data
  model. No queries/mutations have been ported yet — future sessions can
  start by porting one endpoint at a time and swapping the SWR hook in the
  consumer to a Convex `useQuery`.
- Middleware (`web/middleware.ts`) currently treats `/`, `/login`,
  `/signup`, and `/api/*` as public. Tighten this as more routes move to
  Convex.
