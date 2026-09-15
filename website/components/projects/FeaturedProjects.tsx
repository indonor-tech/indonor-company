"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { featuredProjects, fetchWebsiteProjects, projectStatusLabel, type ClientProject } from "@/lib/projects";

function FeaturedSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="aspect-[16/10] animate-pulse bg-muted" />
          <div className="space-y-3 p-6">
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-12 w-full animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FeaturedProjects() {
  const [projects, setProjects] = useState<ClientProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = featuredProjects(await fetchWebsiteProjects(), 6);
        if (!cancelled) setProjects(data);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load projects.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="mx-auto w-full max-w-7xl px-4 sm:px-6">
      <div className="mb-10 flex flex-col gap-4 sm:mb-12 md:flex-row md:items-end md:justify-between md:gap-6">
        <div className="max-w-2xl min-w-0">
          <p className="mb-2 font-semibold tracking-wide text-primary">
            SELECTED WORK
          </p>
          <h2 className="text-3xl font-bold text-foreground md:text-4xl">
            Client Projects
          </h2>
          <p className="mt-3 text-muted-foreground">
            A snapshot of six client and internal projects — completed or still
            in progress — with live URLs and demo recordings on the projects page.
          </p>
        </div>

        <Link
          href="/projects"
          className="inline-flex items-center gap-2 font-semibold text-primary transition-all hover:gap-3"
        >
          View all projects
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {loading ? (
        <div>
          <p className="sr-only">Loading client projects</p>
          <FeaturedSkeleton />
        </div>
      ) : error ? (
        <p className="text-center text-destructive">{error}</p>
      ) : !projects.length ? (
        <p className="text-center text-muted-foreground">
          Projects will appear here once they are published from the Indonor admin.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-3">
          {projects.map((project) => (
            <article
              key={project.id}
              className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card"
            >
              <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                {project.coverImage ? (
                  // Dynamic CMS URLs can come from any host.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={project.coverImage}
                    alt={project.title}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                ) : null}
              </div>

              <div className="flex flex-1 flex-col p-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {project.client}
                </p>
                <span className={`mt-2 inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold ${project.status === "IN_PROGRESS" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                  {projectStatusLabel(project.status)}
                </span>
                <h3 className="mt-2 text-xl font-semibold text-foreground">
                  {project.title}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground line-clamp-3">
                  {project.summary}
                </p>

                <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                  {project.url ? (
                    <Link
                      href={project.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary"
                    >
                      Live URL
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  ) : <span />}
                  <Link
                    href="/projects"
                    className="text-sm font-medium text-primary"
                  >
                    Details
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
