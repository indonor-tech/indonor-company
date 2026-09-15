import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const BLOCKED_METHODS = new Set(["TRACE", "TRACK"]);

export function middleware(request: NextRequest) {
  if (BLOCKED_METHODS.has(request.method.toUpperCase())) {
    return new NextResponse(null, { status: 405 });
  }

  const response = NextResponse.next();

  // Extra hardening on top of next.config headers
  response.headers.set("X-Robots-Tag", "index, follow, max-image-preview:large");
  response.headers.set("X-Content-Type-Options", "nosniff");

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
