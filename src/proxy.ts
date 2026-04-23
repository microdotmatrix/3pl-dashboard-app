import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

const AUTH_PAGES = new Set([
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
]);

const PUBLIC_PAGES = new Set(["/pending-approval"]);

const isAuthPage = (pathname: string) => AUTH_PAGES.has(pathname);
const isPublicPage = (pathname: string) => PUBLIC_PAGES.has(pathname);

export const proxy = (request: NextRequest) => {
  const { pathname, search } = request.nextUrl;
  const sessionCookie = getSessionCookie(request);
  const hasSession = Boolean(sessionCookie);

  if (!hasSession) {
    if (isAuthPage(pathname) || isPublicPage(pathname)) {
      return NextResponse.next();
    }
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    if (pathname !== "/") {
      url.searchParams.set("redirect", `${pathname}${search}`);
    }
    return NextResponse.redirect(url);
  }

  if (isAuthPage(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
};

export const config = {
  matcher: [
    /*
     * Run on everything except:
     * - API routes (they handle their own auth)
     * - Next internals and static assets
     */
    "/((?!api|_next/static|_next/image|favicon.ico|file.svg|globe.svg|next.svg|vercel.svg|window.svg).*)",
  ],
};
