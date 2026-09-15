import { NextResponse } from "next/server";
import { crmApiCandidates, toSiteAssetUrl } from "@/lib/crmApi";

export const runtime = "nodejs";

function rewriteProject(project: {
  coverImage?: string;
  video?: { type?: string; src?: string; id?: string } | null;
}) {
  const video = project.video?.type === "file" && project.video.src
    ? { ...project.video, src: toSiteAssetUrl(project.video.src) || project.video.src }
    : project.video;
  return {
    ...project,
    coverImage: toSiteAssetUrl(project.coverImage) || project.coverImage,
    video
  };
}

export async function GET() {
  let lastError: unknown;
  for (const apiUrl of crmApiCandidates()) {
    try {
      const response = await fetch(`${apiUrl}/website-projects/public`, { cache: "no-store" });
      const result = await response.json().catch(() => ({ success: false, data: [] }));
      if (response.ok) {
        const data = Array.isArray(result.data) ? result.data.map(rewriteProject) : [];
        return NextResponse.json({ ...result, data });
      }
      lastError = result;
    } catch (error) {
      lastError = error;
    }
  }
  return NextResponse.json({
    success: false,
    message: "Projects are unavailable right now.",
    data: [],
    error: lastError instanceof Error ? lastError.message : undefined
  }, { status: 502 });
}
