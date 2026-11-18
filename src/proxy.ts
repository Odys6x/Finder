import { NextResponse, type NextRequest } from "next/server";

/**
 * Admin gate: HTTP Basic auth with ADMIN_PASSWORD (any username).
 * If ADMIN_PASSWORD is unset, admin is disabled entirely.
 */
export function proxy(req: NextRequest) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    return new NextResponse("Admin is disabled. Set ADMIN_PASSWORD to enable it.", { status: 404 });
  }
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    const pass = decoded.slice(decoded.indexOf(":") + 1);
    if (pass.length === password.length && timingSafeEqualStr(pass, password)) return NextResponse.next();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="SchoolPath admin"' },
  });
}

function timingSafeEqualStr(a: string, b: string) {
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
