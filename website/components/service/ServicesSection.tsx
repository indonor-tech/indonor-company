import { Cpu, Code, Smartphone, Users, Cloud, Sparkles } from "lucide-react";
import ServiceCard from "./ServiceCard";

const services = [
  {
    title: "Custom Software Engineering",
    description:
      "Design and delivery of web platforms and enterprise tools tailored to Nordic business requirements.",
    icon: <Code />,
  },
  {
    title: "AI & Data Solutions",
    description:
      "Practical AI adoption, LLM integrations, and workflow automation with strong governance.",
    icon: <Sparkles />,
  },
  {
    title: "Product Engineering",
    description:
      "End-to-end engineering for customer portals, internal apps, and digital product modernization.",
    icon: <Smartphone />,
  },
  {
    title: "Cloud & Platform Ops",
    description:
      "Cloud architecture, platform reliability, and DevOps automation for secure scaling.",
    icon: <Cloud />,
  },
  {
    title: "Team Extension",
    description:
      "Flexible India-based engineering capacity aligned with Norwegian consulting and delivery standards.",
    icon: <Users />,
  },
  {
    title: "Digital Transformation",
    description:
      "Legacy modernization, process digitization, and change support for long-term business impact.",
    icon: <Cpu />,
  },
];

export default function ServicesSection() {
  return (
    <section className="max-w-7xl mx-auto px-6">

      <div className="text-center mb-16">
        <h2 className="text-4xl font-bold">
          What We Offer
        </h2>

        <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
          We provide full-cycle consulting and engineering services for teams
          operating in Norway and across the wider Nordic region.
        </p>
      </div>

      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((service, index) => (
          <ServiceCard key={index} {...service} />
        ))}
      </div>

    </section>
  );
}