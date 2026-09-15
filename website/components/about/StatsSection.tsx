export default function StatsSection() {

  const stats = [
    { number: "2", label: "Core Regions: India & Norway" },
    { number: "10+", label: "Years Combined Experience" },
    { number: "6", label: "Industries Supported" },
    { number: "100%", label: "Client-Focused Delivery" },
  ];

  return (
    <section className="bg-muted py-20">

      <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-4 gap-10 text-center">

        {stats.map((stat, index) => (
          <div key={index}>
            <h3 className="text-4xl font-bold text-primary">
              {stat.number}
            </h3>
            <p className="text-muted-foreground mt-2">
              {stat.label}
            </p>
          </div>
        ))}

      </div>

    </section>
  );
}