import ContactCTA from "../../components/contact/ContactCTA";
import ContactForm from "../../components/contact/ContactForm";
import ContactHero from "../../components/contact/ContactHero";
import ContactInfo from "../../components/contact/ContactInfo";
import MapSection from "../../components/contact/MapSection";
import { buildMetadata, pageSeo } from "@/lib/site";

export const metadata = buildMetadata(pageSeo.contact);

export default function ContactPage() {
  return (
    <div className="flex flex-col">
      <ContactHero />

      <div className="py-24 lg:py-32 bg-gradient-to-b from-background to-muted/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            <div className="lg:col-span-5 w-full">
              <MapSection />
            </div>

            <div className="lg:col-span-3">
              <ContactInfo />
            </div>

            <div className="lg:col-span-4">
              <ContactForm />
            </div>
          </div>
        </div>
      </div>

      <ContactCTA />
    </div>
  );
}
