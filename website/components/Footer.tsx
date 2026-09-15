import BrandLogo from "./BrandLogo";
import { siteConfig } from "@/lib/site";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 w-full max-w-[100vw] overflow-x-hidden border-t border-border bg-muted/60 py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-5 px-4 text-center text-sm text-muted-foreground sm:px-6">
        <BrandLogo variant="withText" className="max-w-full flex-wrap justify-center" />

        <p className="max-w-xl px-1">
          © {year} {siteConfig.legalName}. Norway & India technology consulting.
          Also known as Indonor, Indo, and Indonor Tech.
        </p>
      </div>
    </footer>
  );
}
