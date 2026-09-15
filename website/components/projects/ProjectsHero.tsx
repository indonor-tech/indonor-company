export default function ProjectsHero() {
  return (
    <section className="relative pt-36 pb-16 px-6 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-background to-background" />
      <div className="relative max-w-4xl mx-auto text-center">
        <p className="text-primary font-semibold tracking-wide mb-3">
          CLIENT WORK
        </p>
        <h1 className="text-4xl md:text-6xl font-bold text-foreground leading-tight">
          Projects Delivered for Our Clients
        </h1>
        <p className="mt-5 text-lg text-muted-foreground max-w-2xl mx-auto">
          Selected IndonorTech engagements with live project links, short delivery
          notes, and demo recordings where available. Six projects in total —
          completed or currently in progress.
        </p>
      </div>
    </section>
  );
}
