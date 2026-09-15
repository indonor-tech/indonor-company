import Image from "next/image";

export default function CompanyIntro() {
  return (
    <section className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">
      <div>
        <h2 className="text-3xl font-bold mb-6">Who We Are</h2>

        <p className="text-muted-foreground mb-4">
          IndonorTech (Indonor Technologies Private Limited), also known as
          Indonor, is a cross-border consulting company with delivery teams in
          India and business consulting presence in Norway.
        </p>

        <p className="text-muted-foreground">
          We combine Nordic business understanding with strong engineering
          execution to help clients modernize platforms, automate workflows,
          and launch secure digital services faster across Norway, India, and
          international markets.
        </p>
      </div>

      <div className="relative h-[350px] rounded-2xl overflow-hidden">
        <Image
          src="/images/team.jpeg"
          alt="IndonorTech consulting team — Indonor Technologies Private Limited"
          fill
          className="object-cover"
        />
      </div>
    </section>
  );
}
