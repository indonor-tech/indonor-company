import Image from "next/image";

export default function TeamHero() {
  return (
    <section className="relative flex h-[70vh] min-h-[420px] items-center justify-center text-center">
      <Image
        src="/images/team.jpeg"
        alt="IndonorTech team — Indonor Technologies Private Limited"
        fill
        priority
        className="object-cover"
      />
      <div className="absolute inset-0 bg-black/45" />
      <div className="relative z-10 max-w-3xl px-6 pt-24 text-white">
        <p className="mb-3 font-semibold tracking-wide text-brand-glow">
          INDONORTECH TEAM
        </p>
        <h1 className="mb-6 text-4xl font-bold md:text-6xl">People behind IndonorTech</h1>
        <p className="text-lg opacity-90">
          Consultants and engineers in India and Norway who design, build, and
          deliver digital products for Nordic clients.
        </p>
      </div>
    </section>
  );
}
