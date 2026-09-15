import Image from "next/image";

export default function HeroSection() {
  return (
    <section className="relative h-[90vh] flex items-center justify-center text-center">

      <Image
        src="/images/office1.png"
        alt="services"
        fill
        priority
        className="object-cover"
      />

      {/* overlay */}
      <div className="absolute inset-0 bg-black/50" />

      <div className="relative z-10 max-w-4xl mx-auto px-6 text-white">

        <h1 className="text-5xl md:text-6xl font-bold">
          Consulting Services for Norway and the Nordics
        </h1>

        <p className="mt-6 text-lg md:text-xl opacity-90">
          From strategy to delivery, our India-Norway team helps businesses
          build secure software platforms, adopt AI responsibly, and scale
          cloud operations with confidence.
        </p>

        <button className="mt-8 px-8 py-3 rounded-full bg-primary hover:bg-primary/90 transition text-primary-foreground">
          Discuss Your Roadmap
        </button>

      </div>
    </section>
  );
}