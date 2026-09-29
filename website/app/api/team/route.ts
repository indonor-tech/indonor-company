import { NextResponse } from "next/server";
import {
  crmApiCandidates,
  toSiteAssetUrl,
} from "@/lib/crmApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    displayOrder: member.displayOrder ?? 0,
  };
}

export async function GET() {
  const candidates = crmApiCandidates();

  console.log("CRM API candidates:", candidates);

  if (!candidates.length) {
    return NextResponse.json(
      {
        success: false,
        message: "CRM API URL is not configured.",
        data: [],
      },
      { status: 500 }
    );
  }

  let lastError: unknown;

  for (const apiUrl of candidates) {
    const url = `${apiUrl}/website-team/public`;

    try {
      console.log("Calling CRM:", url);

      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      });

      console.log("CRM response:", response.status);

      const result = await response.json().catch(() => ({
        success: false,
        data: [],
      }));

      if (response.ok) {
        const data = Array.isArray(result.data)
          ? result.data.map(fromCrmTeam)
          : [];

        return NextResponse.json({
          ...result,
          data,
        });
      }

      console.error(
        `CRM ${url} returned ${response.status}`,
        result
      );

      lastError = result;
    } catch (error) {
      console.error(`CRM request failed: ${url}`, error);
      lastError = error;
    }
  }

  return NextResponse.json(
    {
      success: false,
      message: "Team profiles are unavailable right now.",
      data: [],
      error:
        lastError instanceof Error
          ? lastError.message
          : undefined,
    },
    { status: 502 }
  );
}