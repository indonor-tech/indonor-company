import AboutHero from "../../components/about/AboutHero";
import CompanyIntro from "../../components/about/CompanyIntro";
import IndustrySection from "../../components/about/IndustrySection";
import StatsSection from "../../components/about/StatsSection";
import TeamCTA from "../../components/about/TeamCTA";
import { buildMetadata, pageSeo } from "@/lib/site";

export const metadata = buildMetadata(pageSeo.about);

export default function AboutPage() {
  return (
    <div className="flex flex-col gap-28">
      <AboutHero />
      <CompanyIntro />
      <StatsSection />
      <IndustrySection />
      <TeamCTA />
    </div>
  );
}
