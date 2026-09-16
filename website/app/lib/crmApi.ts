const LOCAL_CRM_API = "http://127.0.0.1:5000/api/v1";
const HOSTED_CRM_API = "https://indonor-tech.onrender.com/api/v1";

function isDevelopment() {
  return process.env.NODE_ENV === "development";
}

function normalizeCrmUrl(raw: string) {
  return raw.replace(/\/$/, "").replace("://localhost", "://127.0.0.1").replace("://[::1]", "://127.0.0.1");
}

function localCrmApiUrl() {
  return normalizeCrmUrl(
    process.env.NEXT_PUBLIC_LOCAL_CRM_API_URL || process.env.CRM_LOCAL_API_URL || LOCAL_CRM_API
  );
}

function serverCrmApiUrl() {
  return normalizeCrmUrl(
    process.env.CRM_SERVER_API_URL || process.env.NEXT_PUBLIC_SERVER_CRM_API_URL || HOSTED_CRM_API
  );
}

export function crmApiUrl() {
  return isDevelopment() ? localCrmApiUrl() : serverCrmApiUrl();
}

export function crmApiCandidates() {
  if (isDevelopment()) {
    return [...new Set([localCrmApiUrl(), serverCrmApiUrl()].filter(Boolean))];
  }
  return [...new Set([serverCrmApiUrl()].filter(Boolean))];
}

const crmMediaPath = /^\/api\/v1\/(website-team\/photos|website-team\/member-photos|website-team\/employee-photos|website-projects\/media)\/([^/?#]+)$/;

function crmOrigins() {
  return [...new Set(
    [localCrmApiUrl(), serverCrmApiUrl(), LOCAL_CRM_API, HOSTED_CRM_API].map((url) => {
      try { return new URL(url).origin; } catch { return ""; }
    }).filter(Boolean)
  )];
}

export function toSiteAssetUrl(url?: string | null) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed, "http://asset.local");
    const match = parsed.pathname.match(crmMediaPath);
    if (match) {
      const isAbsolute = /^https?:\/\//i.test(trimmed);
      const ours = !isAbsolute
        || /^(localhost|127\.0\.0\.1)$/i.test(parsed.hostname)
        || crmOrigins().includes(parsed.origin);
      if (ours) return `/api/media/${match[1]}/${match[2]}`;
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}
