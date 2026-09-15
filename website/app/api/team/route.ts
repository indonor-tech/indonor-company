import { NextResponse } from "next/server";
import { crmApiCandidates, toSiteAssetUrl } from "@/lib/crmApi";

export const runtime = "nodejs";

export async function GET() {
  let lastError: unknown;
  for (const apiUrl of crmApiCandidates()) {
    try {
      const response = await fetch(`${apiUrl}/website-team/public`, { cache: "no-store" });
      const result = await response.json().catch(() => ({ success: false, data: [] }));
      if (response.ok) {
        const data = Array.isArray(result.data)
          ? result.data.map((member: { photoUrl?: string }) => ({ ...member, photoUrl: toSiteAssetUrl(member.photoUrl) }))
          : [];
        return NextResponse.json({ ...result, data });
      }
      lastError = result;
    } catch (error) {
      lastError = error;
    }
  }
  return NextResponse.json({
    success: false,
    message: "Team profiles are unavailable right now.",
    data: [],
    error: lastError instanceof Error ? lastError.message : undefined
  }, { status: 502 });
}
