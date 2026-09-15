import ProjectsHero from "../../components/projects/ProjectsHero";
import ProjectsSection from "../../components/projects/ProjectsSection";
import TeamCTA from "../../components/about/TeamCTA";
import { buildMetadata, pageSeo } from "@/lib/site";

export const metadata = buildMetadata(pageSeo.projects);

export default function ProjectsPage() {
  return (
    <div className="flex flex-col">
      <ProjectsHero />
      <ProjectsSection />
      <div className="mt-8">
        <TeamCTA />
      </div>
    </div>
  );
}
