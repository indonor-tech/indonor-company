const LOCAL_CRM_API = "http://127.0.0.1:5000/api/v1";
const HOSTED_CRM_API = "https://indonor-tech.onrender.com/api/v1";

function isDevelopment() {
  return process.env.NODE_ENV === "development";
}

function normalizeCrmUrl(raw: string) {
  return raw.replace(/\/$/, "").replace("://localhost", "://127.0.0.1").replace("://[::1]", "://127.0.0.1");
}

export function crmApiUrl() {
  if (isDevelopment()) {
    return normalizeCrmUrl(
      process.env.NEXT_PUBLIC_LOCAL_CRM_API_URL || process.env.CRM_LOCAL_API_URL || LOCAL_CRM_API
    );
  }
  return normalizeCrmUrl(
    process.env.CRM_SERVER_API_URL || process.env.NEXT_PUBLIC_SERVER_CRM_API_URL || HOSTED_CRM_API
  );
}

export function crmApiCandidates() {
  const primary = crmApiUrl();
  if (!isDevelopment()) return primary ? [primary] : [];
  return [...new Set([primary, LOCAL_CRM_API].filter(Boolean))];
}

const crmMediaPath = /^\/api\/v1\/(website-team\/photos|website-projects\/media)\/([^/?#]+)$/;

export function toSiteAssetUrl(url?: string | null) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed, "http://local.invalid");
    const match = parsed.pathname.match(crmMediaPath);
    if (match) return `/api/media/${match[1]}/${match[2]}`;
  } catch {
    return trimmed;
  }
  const relative = trimmed.match(crmMediaPath);
  return relative ? `/api/media/${relative[1]}/${relative[2]}` : trimmed;
}
