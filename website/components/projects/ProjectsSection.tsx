"use client";

import { useEffect, useState } from "react";
import { fetchWebsiteProjects, type ClientProject } from "@/lib/projects";
import ProjectCard from "./ProjectCard";

function ProjectsSkeleton() {
  return (
    <div className="space-y-16" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="grid items-start gap-8 border-b border-border pb-16 lg:grid-cols-2 lg:gap-12">
          <div className="aspect-video animate-pulse rounded-xl bg-muted" />
          <div className="space-y-4">
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="h-8 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-16 w-full animate-pulse rounded bg-muted" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ProjectsSection() {
  const [projects, setProjects] = useState<ClientProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchWebsiteProjects();
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

  if (loading) {
    return (
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <p className="sr-only">Loading client projects</p>
        <ProjectsSkeleton />
      </section>
    );
  }

  if (error) {
    return (
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <p className="text-center text-destructive">{error}</p>
      </section>
    );
  }

  if (!projects.length) {
    return (
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <p className="mx-auto max-w-xl text-center text-muted-foreground">
          Projects will appear here once they are published from the Indonor admin.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-7xl px-6 pb-24">
      <div className="space-y-16">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </section>
  );
}
