import TeamCTA from "../../components/about/TeamCTA";
import TeamGrid from "../../components/team/TeamGrid";
import TeamHero from "../../components/team/TeamHero";
import { buildMetadata, pageSeo } from "@/lib/site";

export const metadata = buildMetadata(pageSeo.team);

export default function TeamPage() {
  return (
    <div className="flex flex-col">
      <TeamHero />
      <section className="bg-gradient-to-b from-background to-muted/40 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-foreground md:text-4xl">Meet the team</h2>
            <p className="mt-4 text-muted-foreground">
              A Norway–India consulting group. Profiles and order are managed from the Indonor admin.
            </p>
          </div>
          <TeamGrid />
        </div>
      </section>
      <TeamCTA />
    </div>
  );
}
