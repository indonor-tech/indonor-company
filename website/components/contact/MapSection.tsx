export default function MapSection() {
  const embedUrl = "https://www.google.com/maps?q=Oslo%2C%20Norway&output=embed";

  return (
    <section className="w-full">
      <div className="mb-6">
        <h2 className="text-3xl font-bold mb-2 text-foreground">Find Us</h2>
        <p className="text-muted-foreground">Visit our Norway consulting location</p>
      </div>
      <div className="relative w-full rounded-2xl overflow-hidden border border-border shadow-lg h-[500px] hover:shadow-xl transition-shadow duration-300">
        <iframe
          src={embedUrl}
          width="100%"
          height="100%"
          style={{ border: 0 }}
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title="Oslo Norway Map Location"
          className="w-full h-full"
        ></iframe>
      </div>
    </section>
  );
}
