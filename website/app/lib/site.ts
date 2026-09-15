const isDevelopment = process.env.NODE_ENV === "development";
const localSiteUrl = process.env.NEXT_PUBLIC_LOCAL_SITE_URL || "http://localhost:3000";
const serverSiteUrl =
  process.env.NEXT_PUBLIC_SERVER_SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://indonortech.com";

export const siteConfig = {
  name: "IndonorTech",
  legalName: "Indonor Technologies Private Limited",
  shortName: "Indonor",
  tagline: "Norway–India Technology Consulting",
  description:
    "IndonorTech (Indonor Technologies Private Limited) is a Norway–India technology consulting company delivering digital platforms, cloud, AI, and engineering services for Nordic and international businesses.",
  url: (isDevelopment ? localSiteUrl : serverSiteUrl).replace(/\/$/, ""),
  locale: "en_US",
  emails: [
    "dev@indonortech.com",
    "info@indonortech.com",
    "kaiynat.ashraf8@gmail.com",
  ],
  email: "info@indonortech.com",
  phoneNorway: "+47 414 416 28",
  phoneIndia: "+91 78998 76574",
  keywords: [
    "IndonorTech",
    "Indonor",
    "Indo",
    "Indonor Technologies",
    "Indonor Technologies Private Limited",
    "Indonor Tech",
    "Indonortech",
    "Norway India consulting",
    "Norway India technology",
    "Nordic technology consultants",
    "India Norway software consulting",
    "Oslo technology consulting",
    "cross-border IT consulting",
    "digital platform consulting Norway",
    "cloud and AI consulting Nordics",
  ],
  sameAs: [] as string[],
  addresses: {
    norway: {
      locality: "Oslo",
      country: "NO",
      countryName: "Norway",
    },
    india: {
      locality: "New Delhi",
      postalCode: "110026",
      country: "IN",
      countryName: "India",
    },
  },
} as const;

export type PageSeo = {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
};

export const pageSeo = {
  home: {
    title: "IndonorTech | Indonor Technologies Private Limited",
    description:
      "Official site of IndonorTech (Indonor Technologies Private Limited) — Norway–India technology consultants for digital platforms, cloud, AI, and engineering delivery.",
    path: "/",
  },
  about: {
    title: "About IndonorTech | Indonor Technologies Private Limited",
    description:
      "Learn about IndonorTech — Indonor Technologies Private Limited — a cross-border consulting team from India and Norway serving Nordic and international clients.",
    path: "/about",
  },
  services: {
    title: "Services | IndonorTech Consulting & Engineering",
    description:
      "Technology consulting services from IndonorTech: digital platforms, cloud, AI, and engineering delivery across Norway and India.",
    path: "/services",
  },
  industries: {
    title: "Industries | IndonorTech Nordic Technology Partners",
    description:
      "IndonorTech serves energy, retail, manufacturing, finance, healthcare, and public sector clients across Norway and the Nordics.",
    path: "/industries",
  },
  contact: {
    title: "Contact IndonorTech | Norway & India Offices",
    description:
      "Contact Indonor Technologies Private Limited (IndonorTech) in Oslo, Norway and New Delhi, India for consulting and delivery partnerships.",
    path: "/contact",
  },
  projects: {
    title: "Client Projects | IndonorTech Delivery Portfolio",
    description:
      "Explore IndonorTech client projects with live URLs, delivery details, and demo video recordings from Norway–India consulting engagements.",
    path: "/projects",
    keywords: [
      "IndonorTech projects",
      "Indonor client work",
      "Norway India case studies",
    ],
  },
  team: {
    title: "Team | IndonorTech Consultants in Norway and India",
    description:
      "Meet the IndonorTech team — consultants and engineers across Norway and India delivering digital platforms, cloud, and AI for Nordic clients.",
    path: "/team",
    keywords: ["IndonorTech team", "Indonor consultants", "Norway India team"],
  },
} as const satisfies Record<string, PageSeo>;

export function absoluteUrl(path = "/") {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${siteConfig.url}${normalized === "/" ? "" : normalized}`;
}

export function buildMetadata({
  title,
  description,
  path,
  keywords = [],
}: PageSeo) {
  const url = absoluteUrl(path);
  const allKeywords = [...siteConfig.keywords, ...keywords];

  return {
    title,
    description,
    keywords: allKeywords,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: siteConfig.legalName,
      locale: siteConfig.locale,
      type: "website" as const,
      images: [
        {
          url: absoluteUrl("/images/logo.png"),
          width: 1200,
          height: 630,
          alt: `${siteConfig.name} — ${siteConfig.legalName}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image" as const,
      title,
      description,
      images: [absoluteUrl("/images/logo.png")],
    },
  };
}
