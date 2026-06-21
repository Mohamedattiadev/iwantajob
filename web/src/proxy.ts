import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/login",
  "/signup",
  "/welcome",
  "/api/auth",
  "/api/auth/(.*)",
  // /be/* is the rewrite prefix to the FastAPI backend (bound to 127.0.0.1).
  // The backend handles its own auth; the Next.js proxy must not 302 those
  // requests to /login or iframes (e.g. the CV PDF preview) get hijacked
  // and render the sign-in form instead of the PDF.
  "/be/(.*)",
]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  if (isPublicRoute(request)) return;
  if (!(await convexAuth.isAuthenticated())) {
    return nextjsMiddlewareRedirect(request, "/login");
  }
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon-.*\\.png|apple-touch-icon\\.png|manifest\\.webmanifest|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)",
  ],
};
