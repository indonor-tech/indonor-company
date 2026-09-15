import Image from "next/image";

export default function CTASection() {
  return (
    <section className="relative py-24 text-center text-white">

      <Image
        src="/images/about-bg1.jpg"
        alt="cta"
        fill
        className="object-cover"
      />

      <div className="absolute inset-0 bg-black/60" />

      <div className="relative max-w-3xl mx-auto px-6">

        <h2 className="text-4xl md:text-5xl font-bold">
          Planning a Norway-Focused Digital Initiative?
        </h2>

        <p className="mt-4 opacity-90">
          Partner with our consultants and engineers in Norway and India to
          deliver reliable, scalable, and business-ready technology.
        </p>

        <button className="mt-8 px-8 py-3 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition">
          Let&apos;s Talk
        </button>

      </div>

    </section>
  );
}