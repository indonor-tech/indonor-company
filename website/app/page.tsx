import FeaturedProjects from "../components/projects/FeaturedProjects";
import { buildMetadata, pageSeo } from "@/lib/site";

export const metadata = buildMetadata(pageSeo.home);

export default function Home() {
  const expertise = [
    {
      title: "Software Development",
      desc: "Custom web, mobile and enterprise applications built for performance and scalability.",
      icon: "💻",
    },
    {
      title: "Cloud Solutions",
      desc: "Cloud migration, infrastructure modernization and managed cloud services.",
      icon: "☁️",
    },
    {
      title: "DevOps & Automation",
      desc: "CI/CD pipelines, Kubernetes, Docker, Infrastructure as Code and automation.",
      icon: "⚙️",
    },
    {
      title: "Artificial Intelligence",
      desc: "AI-powered business solutions, automation and intelligent analytics.",
      icon: "🤖",
    },
    {
      title: "Cyber Security",
      desc: "Secure digital infrastructure, compliance and proactive security practices.",
      icon: "🔒",
    },
    {
      title: "IT Consulting",
      desc: "Helping organizations make informed technology decisions for long-term growth.",
      icon: "📈",
    },
  ];

  const reasons = [
    "Norway-focused delivery approach",
    "Transparent communication",
    "Agile project execution",
    "Highly skilled engineering teams",
    "Secure & scalable architecture",
    "Long-term technology partnership",
  ];

  return (
    <div className="w-full max-w-[100vw] overflow-x-hidden bg-background text-foreground">
      {/* HERO */}
      <section
        className="relative min-h-svh w-full overflow-hidden bg-cover bg-center"
        style={{
          backgroundImage: "url('/images/banner-1.png')",
        }}
      >
        <div className="absolute inset-0 bg-black/60" />

        <div className="relative z-10 flex min-h-svh items-center py-28">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
            <h1 className="mt-4 max-w-4xl text-3xl font-bold leading-tight text-white sm:text-5xl md:text-6xl">
              Engineering Digital Excellence
            </h1>

            <p className="mt-5 max-w-3xl text-base leading-7 text-white/85 sm:mt-8 sm:text-xl sm:leading-9">
              IndonorTech helps businesses across Norway accelerate digital
              transformation through secure software engineering, cloud
              solutions, DevOps, AI, cybersecurity and strategic IT consulting.
            </p>

            <div className="mt-8 flex flex-wrap gap-3 sm:mt-12 sm:gap-5">
              <a
                href="/services"
                className="rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 sm:px-8 sm:py-4 sm:text-base"
              >
                Explore Services
              </a>

              <a
                href="/contact"
                className="rounded-lg border border-white px-6 py-3 text-sm font-semibold text-white transition hover:bg-white hover:text-black sm:px-8 sm:py-4 sm:text-base"
              >
                Contact Us
              </a>
            </div>

            <div className="mt-10 grid grid-cols-2 gap-4 sm:mt-16 sm:gap-6 md:grid-cols-4">
              <div>
                <h3 className="text-2xl font-bold text-white sm:text-3xl">Delivery</h3>
                <p className="text-sm text-white/70 sm:text-base">Projects completed and ongoing</p>
              </div>

              <div>
                <h3 className="text-2xl font-bold text-white sm:text-3xl">20+</h3>
                <p className="text-sm text-white/70 sm:text-base">Technology Experts</p>
              </div>

              <div>
                <h3 className="text-2xl font-bold text-white sm:text-3xl">24/7</h3>
                <p className="text-sm text-white/70 sm:text-base">Support</p>
              </div>

              <div>
                <h3 className="text-2xl font-bold text-white sm:text-3xl">99%</h3>
                <p className="text-sm text-white/70 sm:text-base">Client Satisfaction</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WHY US */}
      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
        <h2 className="text-center text-3xl font-bold sm:text-4xl md:text-5xl">
          Why Choose IndonorTech?
        </h2>

        <p className="mx-auto mt-4 max-w-3xl text-center text-base text-muted-foreground sm:mt-6 sm:text-lg">
          We combine technical excellence, business understanding and a
          collaborative delivery model to help organizations innovate with
          confidence.
        </p>

        <div className="mt-10 grid gap-6 sm:mt-16 sm:gap-8 md:grid-cols-2 lg:grid-cols-3">
          {reasons.map((item) => (
            <div
              key={item}
              className="rounded-xl border border-border bg-card p-6 shadow-sm transition hover:-translate-y-2 hover:shadow-xl sm:p-8"
            >
              <h3 className="text-lg font-semibold text-card-foreground sm:text-xl">{item}</h3>

              <p className="mt-3 text-sm text-muted-foreground sm:mt-4 sm:text-base">
                Delivering quality solutions through innovation,
                transparency and long-term partnership.
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* EXPERTISE */}
      <section className="w-full bg-muted py-16 sm:py-24">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-bold sm:text-4xl md:text-5xl">Our Expertise</h2>

          <p className="mx-auto mt-4 max-w-3xl text-center text-base text-muted-foreground sm:mt-6 sm:text-lg">
            Empowering businesses with modern technologies and future-ready
            digital solutions.
          </p>

          <div className="mt-10 grid gap-6 sm:mt-16 sm:gap-8 md:grid-cols-2 lg:grid-cols-3">
            {expertise.map((service) => (
              <div
                key={service.title}
                className="rounded-xl border border-border bg-card p-6 shadow transition hover:-translate-y-2 hover:shadow-2xl sm:p-8"
              >
                <div className="text-4xl sm:text-5xl">{service.icon}</div>

                <h3 className="mt-4 text-xl font-bold text-card-foreground sm:mt-6 sm:text-2xl">
                  {service.title}
                </h3>

                <p className="mt-3 text-sm text-muted-foreground sm:mt-4 sm:text-base">{service.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CLIENT PROJECTS */}
      <section className="w-full overflow-x-hidden py-16 sm:py-24">
        <FeaturedProjects />
      </section>

      {/* CTA */}
      <section className="w-full bg-primary py-16 text-primary-foreground sm:py-24">
        <div className="mx-auto w-full max-w-5xl px-4 text-center sm:px-6">
          <h2 className="text-3xl font-bold sm:text-4xl md:text-5xl">
            Let&apos;s Build the Future Together
          </h2>

          <p className="mt-5 text-base leading-7 text-primary-foreground/85 sm:mt-8 sm:text-xl sm:leading-9">
            Whether you need software development, cloud transformation,
            DevOps, AI or digital consulting, IndonorTech is ready to become
            your trusted technology partner.
          </p>

          <a
            href="/contact"
            className="mt-8 inline-block rounded-lg bg-background px-8 py-3.5 text-sm font-semibold text-foreground transition hover:opacity-90 sm:mt-10 sm:px-10 sm:py-4 sm:text-base"
          >
            Start Your Project
          </a>
        </div>
      </section>
    </div>
  );
}
