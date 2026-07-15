import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { internalAccessDecision } from "@/lib/server/internal-access";

export function proxy(request: NextRequest) {
  const decision = internalAccessDecision(request, process.env);
  if (decision === "allow") return NextResponse.next();

  const headers = {
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
  };
  if (decision === "not-found") {
    return new NextResponse("Not Found", { status: 404, headers });
  }
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      ...headers,
      "WWW-Authenticate": 'Basic realm="ARU internal", charset="UTF-8"',
    },
  });
}

export const config = {
  matcher: ["/ops/:path*", "/pilot/:path*", "/eval/:path*"],
};
