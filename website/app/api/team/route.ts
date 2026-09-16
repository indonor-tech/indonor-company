import { NextResponse } from "next/server";
import { crmApiCandidates, toSiteAssetUrl } from "@/lib/crmApi";

export const runtime = "nodejs";

type CrmTeamMember = {
  _id?: string;
  id?: string;
  name?: string;
  role?: string;
  roles?: string[];
  bio?: string;
  photoUrl?: string;
  location?: string;
  linkedinUrl?: string;
  displayOrder?: number;
};

function fromCrmTeam(member: CrmTeamMember) {
  return {
    id: String(member.id || member._id || ""),
    name: member.name || "",
    role: member.role || "",
    roles: Array.isArray(member.roles) ? member.roles : [],
    bio: member.bio || "",
    photoUrl: toSiteAssetUrl(member.photoUrl),
    location: member.location || "",
    linkedinUrl: member.linkedinUrl || "",
    displayOrder: member.displayOrder ?? 0
  };
}

export async function GET() {
  let lastError: unknown;
  for (const apiUrl of crmApiCandidates()) {
    try {
      // Same Workspace > Team collection as CRM GET /api/v1/website-team, public route (no login).
      const response = await fetch(`${apiUrl}/website-team/public`, { cache: "no-store" });
      const result = await response.json().catch(() => ({ success: false, data: [] }));
      if (response.ok) {
        const data = Array.isArray(result.data) ? result.data.map(fromCrmTeam) : [];
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
