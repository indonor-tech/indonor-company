"use client";

import { useEffect, useState } from "react";
import { ModeToggle } from "@/components/ModeToggle";
import BrandLogo from "./BrandLogo";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

const navItems = [
  { name: "Home", href: "/" },
  { name: "About", href: "/about" },
  { name: "Team", href: "/team" },
  { name: "Projects", href: "/projects" },
  { name: "Industries", href: "/industries" },
  { name: "Services", href: "/services" },
  { name: "Contact", href: "/contact" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="fixed top-0 left-0 z-50 w-full max-w-[100vw]">
      <div className="mx-auto w-full max-w-7xl px-3 pt-3 sm:px-4 sm:pt-4">
        <nav className="flex items-center justify-between gap-3 rounded-full bg-background/80 px-3 py-2 shadow-sm backdrop-blur-md transition-all duration-300 ease-in-out sm:px-5 md:px-8">
          <BrandLogo variant="mark" priority className="min-w-0 shrink" />

          <div className="hidden items-center gap-8 lg:flex">
            {navItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`text-base font-medium transition-colors xl:text-lg ${
                  pathname === item.href
                    ? "text-primary"
                    : "text-foreground hover:text-primary"
                }`}
              >
                {item.name}
              </Link>
            ))}
            <ModeToggle />
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <ModeToggle />
            <button
              type="button"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-foreground"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </nav>

        {open ? (
          <div className="mt-2 overflow-hidden rounded-2xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur-md lg:hidden">
            <div className="grid grid-cols-2 gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`rounded-xl px-3 py-2.5 text-center text-sm font-medium transition-colors ${
                    pathname === item.href
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/60 text-foreground hover:bg-primary/10"
                  }`}
                >
                  {item.name}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}
