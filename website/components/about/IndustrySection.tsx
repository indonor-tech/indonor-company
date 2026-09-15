const industries = [
  "Energy & Utilities",
  "Retail & eCommerce",
  "Manufacturing",
  "Financial Services",
  "Healthcare",
  "Public Sector & Smart Cities",
];

export default function IndustrySection() {
  return (
    <section className="max-w-6xl mx-auto px-6 text-center">

      <h2 className="text-3xl font-bold mb-12">
        Industries We Serve
      </h2>

      <div className="grid md:grid-cols-3 gap-8">

        {industries.map((item, index) => (
          <div
            key={index}
            className="p-8 rounded-xl border border-border bg-card text-card-foreground hover:border-primary/40 hover:shadow-lg transition"
          >
            {item}
          </div>
        ))}

      </div>

    </section>
  );
}