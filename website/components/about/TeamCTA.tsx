export default function TeamCTA() {
  return (
    <section className="relative py-20 text-center text-white">

      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/images/about-bg1.jpg')" }}
      />

      <div className="absolute inset-0 bg-black/30" />

      <div className="relative max-w-3xl mx-auto px-6">

        <h2 className="text-4xl font-bold mb-6">
          Join Our India-Norway Team
        </h2>

        <p className="opacity-90 mb-8">
          We are looking for consultants, engineers, and delivery partners
          who enjoy building impactful digital products for Nordic clients.
        </p>

        <button className="px-8 py-3 rounded-full bg-primary text-primary-foreground hover:opacity-90">
          Explore Opportunities
        </button>

      </div>

    </section>
  );
}