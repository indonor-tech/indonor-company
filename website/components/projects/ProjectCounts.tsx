"use client";

import { useEffect, useState } from "react";
import { fetchWebsiteProjects, projectCounts } from "@/lib/projects";

export default function ProjectCounts({
  heading = "Client Projects",
  eyebrow = "DELIVERY",
  description = "We share delivery volume only — completed work and work currently in progress.",
}: {
  heading?: string;
  eyebrow?: string;
  description?: string;
}) {
  const [done, setDone] = useState(0);
  const [ongoing, setOngoing] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const counts = projectCounts(await fetchWebsiteProjects());
        if (!cancelled) {
          setDone(counts.done);
          setOngoing(counts.ongoing);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load project counts.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="mx-auto w-full max-w-7xl px-4 sm:px-6">
      <div className="mx-auto mb-10 max-w-2xl text-center sm:mb-12">
        <p className="mb-2 font-semibold tracking-wide text-primary">{eyebrow}</p>
        <h2 className="text-3xl font-bold text-foreground md:text-4xl">{heading}</h2>
        <p className="mt-3 text-muted-foreground">{description}</p>
      </div>

      {loading ? (
        <div className="grid gap-6 sm:grid-cols-2" aria-hidden="true">
          <div className="h-40 animate-pulse rounded-2xl border border-border bg-muted" />
          <div className="h-40 animate-pulse rounded-2xl border border-border bg-muted" />
        </div>
      ) : error ? (
        <p className="text-center text-destructive">{error}</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          <article className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Completed</p>
            <p className="mt-3 text-5xl font-bold text-foreground">{done}</p>
            <p className="mt-2 text-sm text-muted-foreground">Projects delivered</p>
          </article>
          <article className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">Ongoing</p>
            <p className="mt-3 text-5xl font-bold text-foreground">{ongoing}</p>
            <p className="mt-2 text-sm text-muted-foreground">Projects in progress</p>
          </article>
        </div>
      )}
    </section>
  );
}
