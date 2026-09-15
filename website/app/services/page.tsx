import CTASection from "../../components/service/CTASection";
import HeroSection from "../../components/service/HeroSection";
import ServicesSection from "../../components/service/ServicesSection";
import { buildMetadata, pageSeo } from "@/lib/site";

export const metadata = buildMetadata(pageSeo.services);

export default function ServicesPage() {
  return (
    <div className="flex flex-col gap-32">
      <HeroSection />
      <ServicesSection />
      <CTASection />
    </div>
  );
}
