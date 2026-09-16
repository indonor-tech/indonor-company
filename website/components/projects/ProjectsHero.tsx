export default function ProjectsHero() {
  return (
    <section className="relative overflow-hidden px-6 pt-36 pb-16">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-background to-background" />
      <div className="relative mx-auto max-w-4xl text-center">
        <p className="mb-3 font-semibold tracking-wide text-primary">CLIENT WORK</p>
        <h1 className="text-4xl font-bold leading-tight text-foreground md:text-6xl">
          Projects delivered and in progress
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
          We publish delivery counts only: how many client projects are completed, and how many are currently ongoing.
        </p>
      </div>
    </section>
  );
}
