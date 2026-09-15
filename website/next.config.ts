import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

function originOf(value?: string | null) {
  if (!value) return [];
  try {
    const origin = new URL(value).origin;
    if (origin.includes("[") || origin.includes("::")) return [];
    if (isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/i.test(origin)) return [];
    return [origin];
  } catch {
    return [];
  }
}

const hostedCrm =
  process.env.NEXT_PUBLIC_SERVER_CRM_API_URL ||
  process.env.CRM_SERVER_API_URL ||
  "https://indonor-tech.onrender.com/api/v1";

const crmApiOrigins = isProd
  ? originOf(hostedCrm)
  : [
      ...originOf(process.env.NEXT_PUBLIC_LOCAL_CRM_API_URL || "http://127.0.0.1:5000/api/v1"),
      "http://127.0.0.1:5000",
      "http://localhost:5000",
    ];

const allowedCrmOrigins = [...new Set(crmApiOrigins.filter(Boolean))].join(" ");
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `img-src 'self' data: blob: https: ${allowedCrmOrigins}`.trim(),
  "font-src 'self' data: https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  `connect-src 'self' https: ${allowedCrmOrigins}`.trim(),
  "frame-src 'self' https://www.google.com https://maps.google.com https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com",
  `media-src 'self' blob: https: ${allowedCrmOrigins}`.trim(),
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  compress: true,
  experimental: {
    turbopackUseSystemTlsCerts: true,
  },
  images: {
    formats: ["image/avif", "image/webp"],
    dangerouslyAllowSVG: false,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/llms.txt",
        headers: [
          {
            key: "Content-Type",
            value: "text/plain; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
