import { NextResponse } from "next/server";
import { crmApiUrl } from "@/lib/crmApi";

export const runtime = "nodejs";

const MAX = {
  name: 100,
  email: 254,
  company: 120,
  subject: 160,
  message: 4000,
};

type ContactPayload = {
  name?: unknown;
  email?: unknown;
  company?: unknown;
  subject?: unknown;
  message?: unknown;
  website?: unknown;
};

const requests = new Map<string, number[]>();

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/[<>]/g, "").trim().slice(0, max) : "";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (requests.get(ip) || []).filter((timestamp) => now - timestamp < 60 * 60 * 1000);
  if (recent.length >= 5) {
    requests.set(ip, recent);
    return true;
  }
  recent.push(now);
  requests.set(ip, recent);
  return false;
}

export async function POST(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ success: false, message: "Too many requests. Please try again later." }, { status: 429 });
  }

  let payload: ContactPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request body." }, { status: 400 });
  }

  // Automated submissions are acknowledged without sending an email.
  if (payload.website) return NextResponse.json({ success: true, message: "Message received." });

  const name = clean(payload.name, MAX.name);
  const email = clean(payload.email, MAX.email).toLowerCase();
  const company = clean(payload.company, MAX.company);
  const subject = clean(payload.subject, MAX.subject);
  const message = clean(payload.message, MAX.message);

  if (!name || !email || !subject || !message || message.length < 10) {
    return NextResponse.json({ success: false, message: "Please complete all required fields." }, { status: 422 });
  }
  if (!isEmail(email)) {
    return NextResponse.json({ success: false, message: "Please enter a valid email address." }, { status: 422 });
  }
  const apiUrl = crmApiUrl();
  if (!apiUrl) {
    return NextResponse.json({ success: false, message: "Contact service is not configured." }, { status: 503 });
  }

  try {
    const response = await fetch(`${apiUrl.replace(/\/$/, "")}/contact-submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, company, subject, message }),
    });
    const result = await response.json().catch(() => ({ success: false, message: "Invalid contact service response." }));
    return NextResponse.json(result, { status: response.status });
  } catch {
    return NextResponse.json({ success: false, message: "We could not connect to the contact service. Please try again." }, { status: 502 });
  }
}
