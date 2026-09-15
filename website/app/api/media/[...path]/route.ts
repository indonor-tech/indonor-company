import { NextResponse } from "next/server";
import { crmApiCandidates } from "@/lib/crmApi";

export const runtime = "nodejs";

const allowed = new Map([
  ["website-team/photos", /^[0-9a-f-]{36}\.(jpe?g|png|webp|gif)$/i],
  ["website-projects/media", /^[0-9a-f-]{36}\.(jpe?g|png|webp|gif|mp4|webm|mov)$/i]
]);

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const parts = (await context.params).path || [];
  if (parts.length !== 3) return NextResponse.json({ success: false, message: "File not found" }, { status: 404 });
  const prefix = `${parts[0]}/${parts[1]}`;
  const filename = parts[2];
  const pattern = allowed.get(prefix);
  if (!pattern || !pattern.test(filename)) {
    return NextResponse.json({ success: false, message: "File not found" }, { status: 404 });
  }

  let lastError: unknown;
  for (const apiUrl of crmApiCandidates()) {
    try {
      const response = await fetch(`${apiUrl}/${prefix}/${filename}`, { cache: "force-cache" });
      if (!response.ok) {
        lastError = response.status;
        continue;
      }
      return new NextResponse(response.body, {
        status: 200,
        headers: {
          "Content-Type": response.headers.get("content-type") || "application/octet-stream",
          "Cache-Control": "public, max-age=31536000, immutable"
        }
      });
    } catch (error) {
      lastError = error;
    }
  }

  return NextResponse.json({
    success: false,
    message: "File not found",
    error: lastError instanceof Error ? lastError.message : undefined
  }, { status: 404 });
}
