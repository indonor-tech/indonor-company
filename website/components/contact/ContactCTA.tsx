export default function ContactCTA() {
  return (
    <section className="relative py-24 lg:py-32 text-center text-white overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/images/office1.png')" }}
      />

      <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/50 to-black/60"></div>

      <div className="relative max-w-4xl mx-auto px-6 space-y-6">
        <div>
          <p className="text-brand-glow font-semibold text-lg mb-3 tracking-wide">
            READY TO START?
          </p>
          <h2 className="text-5xl lg:text-6xl font-bold mb-4 leading-tight">
            Build with a Norway-India Delivery Model
          </h2>
        </div>

        <p className="text-lg lg:text-xl opacity-95 max-w-2xl mx-auto leading-relaxed">
          Work with our consultants in Norway and engineering teams in India
          to deliver outcomes faster and with confidence.
        </p>

        <div className="pt-6">
          <button className="px-8 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors duration-300 shadow-lg hover:shadow-xl">
            Start Your Project
          </button>
        </div>
      </div>
    </section>
  )
}