import { Mail, Phone, MapPin, Clock } from "lucide-react"
import { siteConfig } from "@/lib/site"

export default function ContactInfo() {
  const contactItems = [
    {
      icon: MapPin,
      title: "Norway Office",
      details: ["Oslo Region, Norway"]
    },
    {
      icon: MapPin,
      title: "India Delivery Center",
      details: ["New Delhi, India", "Pin Code: 110026"]
    },
    {
      icon: Phone,
      title: "Norway Mobile",
      details: ["(+47) 414 416 28"]
    },
    {
      icon: Phone,
      title: "India Mobile",
      details: ["(+91) 78998 76574"]
    },
    {
      icon: Mail,
      title: "Email",
      details: [...siteConfig.emails]
    }
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold mb-2 text-foreground">
          Get in Touch
        </h2>
        <p className="text-muted-foreground">
          We are here to help with your Norway and cross-border delivery goals.
        </p>
      </div>

      <div className="space-y-6">
        {contactItems.map((item, index) => {
          const IconComponent = item.icon;
          return (
            <div key={index} className="flex gap-4 items-start group">
              <div className="flex-shrink-0 w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <IconComponent className="text-primary w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">
                  {item.title}
                </h3>
                {item.details.map((detail, idx) => (
                  <p key={idx} className="text-muted-foreground text-sm">
                    {detail}
                  </p>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-6 bg-gradient-to-br from-muted to-secondary rounded-2xl border border-border mt-8">
        <div className="flex gap-3 items-start mb-3">
          <Clock className="text-primary w-5 h-5 flex-shrink-0 mt-0.5" />
          <h3 className="font-semibold text-foreground text-lg">
            Business Hours
          </h3>
        </div>
        <p className="text-foreground/80 text-sm leading-relaxed">
          <span className="font-medium">Monday – Friday:</span><br/>
          9:00 AM – 5:00 PM (CET/CEST)
        </p>
        <p className="text-muted-foreground text-sm mt-3">
          We respond quickly across Norway and India working hours.
        </p>
      </div>
    </div>
  )
}
