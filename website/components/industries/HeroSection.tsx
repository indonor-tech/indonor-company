import Image from "next/image"

export default function HeroSection() {
  return (
    <section className="relative h-[90vh] flex items-center justify-center text-center">

      <Image
        src="/images/industries-hero.png"
        alt="industries"
        fill
        priority
        className="object-cover"
      />

      <div className="absolute inset-0 bg-black/50" />

      <div className="relative z-10 max-w-3xl px-6 text-white">

        <h1 className="text-5xl md:text-6xl font-bold">
          Industries We Support in Norway
        </h1>

        <p className="mt-6 text-lg opacity-90">
          We help organizations modernize operations with digital solutions
          adapted to Norwegian market realities and compliance expectations.
        </p>

      </div>

    </section>
  )
}