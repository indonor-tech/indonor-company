import { absoluteUrl, siteConfig } from "@/lib/site";

export default function JsonLd() {
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteConfig.url}/#organization`,
    name: siteConfig.name,
    legalName: siteConfig.legalName,
    alternateName: [
      "Indonor",
      "Indo",
      "Indonor Tech",
      "Indonortech",
      "Indonor Technologies",
      "Indonor Technologies Private Limited",
      "Indonor Technologies Pvt Ltd",
    ],
    url: siteConfig.url,
    logo: absoluteUrl("/images/logo.png"),
    image: absoluteUrl("/images/logo.png"),
    description: siteConfig.description,
    email: siteConfig.email,
    telephone: [siteConfig.phoneNorway, siteConfig.phoneIndia],
    foundingLocation: {
      "@type": "Place",
      name: "Norway and India",
    },
    areaServed: [
      { "@type": "Country", name: "Norway" },
      { "@type": "Country", name: "India" },
      { "@type": "Place", name: "Nordics" },
    ],
    address: [
      {
        "@type": "PostalAddress",
        addressLocality: siteConfig.addresses.norway.locality,
        addressCountry: siteConfig.addresses.norway.country,
      },
      {
        "@type": "PostalAddress",
        addressLocality: siteConfig.addresses.india.locality,
        postalCode: siteConfig.addresses.india.postalCode,
        addressCountry: siteConfig.addresses.india.country,
      },
    ],
    contactPoint: [
      {
        "@type": "ContactPoint",
        telephone: siteConfig.phoneNorway,
        contactType: "sales",
        areaServed: "NO",
        availableLanguage: ["English", "Norwegian"],
      },
      {
        "@type": "ContactPoint",
        telephone: siteConfig.phoneIndia,
        contactType: "customer support",
        areaServed: "IN",
        availableLanguage: ["English", "Hindi"],
      },
      {
        "@type": "ContactPoint",
        email: siteConfig.email,
        contactType: "customer service",
        availableLanguage: ["English"],
      },
    ],
    sameAs: siteConfig.sameAs,
    knowsAbout: [
      "Technology consulting",
      "Digital platforms",
      "Cloud computing",
      "Artificial intelligence",
      "Software engineering",
      "Norway India delivery model",
    ],
  };

  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteConfig.url}/#website`,
    url: siteConfig.url,
    name: siteConfig.name,
    alternateName: siteConfig.legalName,
    description: siteConfig.description,
    publisher: { "@id": `${siteConfig.url}/#organization` },
    inLanguage: "en",
  };

  const professionalService = {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "@id": `${siteConfig.url}/#service`,
    name: `${siteConfig.name} Technology Consulting`,
    brand: siteConfig.name,
    url: siteConfig.url,
    image: absoluteUrl("/images/logo.png"),
    description: siteConfig.description,
    provider: { "@id": `${siteConfig.url}/#organization` },
    areaServed: ["Norway", "India", "Nordics"],
    serviceType: [
      "Technology consulting",
      "Software engineering",
      "Cloud consulting",
      "AI consulting",
      "Digital transformation",
    ],
  };

  const payloads = [organization, website, professionalService];

  return (
    <>
      {payloads.map((data, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
        />
      ))}
    </>
  );
}
