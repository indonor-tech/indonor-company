import Image from "next/image";

export default function AboutHero() {
  return (
    <section className="relative h-[90vh] flex items-center justify-center text-center">
      <Image
        src="/images/about-bg1.jpg"
        alt="IndonorTech Norway city skyline — Indonor Technologies Private Limited"
        fill
        priority
        className="object-cover"
      />

      <div className="absolute inset-0 bg-black/40" />

      <div className="relative z-10 max-w-3xl px-6 text-white pt-32">
        <p className="text-brand-glow font-semibold tracking-wide mb-3">
          INDONORTECH · INDONOR TECHNOLOGIES PRIVATE LIMITED
        </p>

        <h1 className="text-5xl font-bold mb-6">
          About IndonorTech
        </h1>

        <p className="text-lg opacity-90">
          We are Indonor Technologies Private Limited — a consulting team from
          India and Norway delivering practical technology solutions for
          organizations across the Nordics.
        </p>
      </div>
    </section>
  );
}
