import { NextResponse } from "next/server";
import { crmApiCandidates } from "@/lib/crmApi";

export const runtime = "nodejs";

const requests = new Map<string, number[]>();

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "127.0.0.1";
}

function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (requests.get(ip) || []).filter((timestamp) => now - timestamp < 60 * 60 * 1000);
  if (recent.length >= 120) {
    requests.set(ip, recent);
    return true;
  }
  recent.push(now);
  requests.set(ip, recent);
  return false;
}

async function forwardToCrm(payload: unknown, request: Request) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-forwarded-for": clientIp(request),
    "user-agent": request.headers.get("user-agent") || "",
  };
  const country = request.headers.get("cf-ipcountry") || request.headers.get("x-vercel-ip-country");
  if (country) headers["cf-ipcountry"] = country;
  const ingestKey = process.env.CRM_ANALYTICS_INGEST_KEY || process.env.WEBSITE_ANALYTICS_INGEST_KEY;
  if (ingestKey) headers["x-analytics-key"] = ingestKey;

  let lastError: unknown;
  for (const apiUrl of crmApiCandidates()) {
    try {
      const response = await fetch(`${apiUrl}/website-analytics/events`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({ success: response.ok }));
      if (response.ok) return { ok: true, status: 200, result };
      lastError = result;
      console.error("[analytics] CRM rejected events", apiUrl, response.status, result);
    } catch (error) {
      lastError = error;
      console.error("[analytics] Could not reach CRM", apiUrl, error instanceof Error ? error.message : error);
    }
  }
  return { ok: false, status: 502, result: { success: false, message: "Could not store website analytics.", error: lastError instanceof Error ? lastError.message : lastError } };
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (rateLimited(ip)) {
    return NextResponse.json({ success: false, message: "Too many requests." }, { status: 429 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid analytics payload." }, { status: 400 });
  }

  const forwarded = await forwardToCrm(payload, request);
  return NextResponse.json(forwarded.result, { status: forwarded.ok ? 200 : 200 });
}
