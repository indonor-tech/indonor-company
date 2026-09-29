import "server-only";

function normalizeUrl(url?: string) {
  return url?.trim().replace(/\/$/, "");
}

export function crmApiCandidates(): string[] {
  const isDevelopment = process.env.NODE_ENV === "development";

  const candidates = isDevelopment
    ? [
        process.env.CRM_LOCAL_API_URL,
        process.env.CRM_SERVER_API_URL,
      ]
    : [
        process.env.CRM_SERVER_API_URL,
      ];

  return candidates
    .map(normalizeUrl)
    .filter((url): url is string => Boolean(url));
}

export function toSiteAssetUrl(url?: string) {
  if (!url) return "";

  if (
    url.startsWith("http://") ||
    url.startsWith("https://")
  ) {
    return url;
  }

  const baseUrl = crmApiCandidates()[0];

  if (!baseUrl) {
    return url;
  }

  return `${baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
}