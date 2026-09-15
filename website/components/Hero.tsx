// components/Hero.tsx
import Image from "next/image";
import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative mt-20 min-h-[88vh] flex items-center justify-center text-center px-6 overflow-hidden">
      <Image
        src="/images/about-bg1.jpg"
        alt="City skyline"
        fill
        priority
        className="object-cover"
      />

      <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/55 to-black/60" />

      <div className="relative z-10 max-w-4xl">
        <p className="text-brand-glow font-semibold tracking-wide mb-3">
          INDIA + NORWAY CONSULTING PARTNERSHIP
        </p>

        <h1 className="text-4xl md:text-6xl font-bold text-white leading-tight">
          Technology Consulting Built for the Nordic Market
        </h1>

        <p className="mt-5 text-lg text-white/90 max-w-3xl mx-auto">
          We help Norwegian and international businesses design, build, and scale
          digital products with a blended team from India and Norway.
        </p>

        <div className="mt-8">
          <Link
            href="/contact"
            className="inline-block rounded-full bg-primary px-7 py-3 text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
          >
            Book a Consultation
          </Link>
        </div>
      </div>
    </section>
  );
}