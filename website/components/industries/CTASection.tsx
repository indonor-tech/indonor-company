import Image from "next/image"

export default function CTASection() {
  return (
    <section className="relative py-28 text-center text-white">

      <Image
        src="/images/industries-lets-build.jpeg"
        alt="cta"
        fill
        className="object-cover"
      />

      <div className="absolute inset-0 bg-black/40" />

      <div className="relative max-w-3xl mx-auto px-6">

        <h2 className="text-4xl md:text-5xl font-bold">
          Build Your Next Nordic Success Story
        </h2>

        <p className="mt-4 opacity-90">
          Collaborate with our Norway and India team to build digital
          platforms that align with your industry and growth goals.
        </p>

        <button className="mt-8 px-8 py-3 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition">
          Start Your Project
        </button>

      </div>

    </section>
  )
}