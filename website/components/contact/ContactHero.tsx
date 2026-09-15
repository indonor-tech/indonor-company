import Image from "next/image"

export default function ContactHero() {
  return (
    <section className="relative h-[85vh] flex items-center justify-center text-center overflow-hidden">
      <Image
        src="/images/about-bg1.jpg"
        alt="Norway business skyline"
        fill
        priority
        className="object-cover"
      />

      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/40 to-black/30"></div>

      <div className="relative text-white max-w-4xl px-6 space-y-6">
        <div>
          <p className="text-brand-glow font-semibold text-lg mb-3 tracking-wide">
            GET IN TOUCH
          </p>
          <h1 className="text-6xl lg:text-7xl font-bold leading-tight">
            Talk to Our Norway + India Team
          </h1>
        </div>

        <p className="text-lg lg:text-xl opacity-95 max-w-2xl mx-auto leading-relaxed">
          Planning your next platform or modernization initiative? Let&apos;s discuss
          how our consultants and engineers can support delivery across Norway
          and international markets.
        </p>

        <div className="pt-4">
          <button className="px-8 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors duration-300">
            Start a Conversation
          </button>
        </div>
      </div>
    </section>
  )
}