import CTASection from "../../components/industries/CTASection";
import HeroSection from "../../components/industries/HeroSection";
import IndustriesSection from "../../components/industries/IndustriesSection";
import { buildMetadata, pageSeo } from "@/lib/site";

export const metadata = buildMetadata(pageSeo.industries);

export default function IndustriesPage() {
  return (
    <div className="flex flex-col gap-28">
      <HeroSection />
      <IndustriesSection />
      <CTASection />
    </div>
  );
}
