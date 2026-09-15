"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export type TeamMember = {
  id: string;
  name: string;
  role: string;
  roles?: string[];
  bio: string;
  photoUrl: string;
  location: string;
  linkedinUrl: string;
};

function displayRoles(member: TeamMember) {
  const roles = (member.roles || []).map((item) => item.trim()).filter(Boolean);
  return roles.length ? roles.join(" · ") : member.role;
}

function TeamSkeleton() {
  return (
    <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="aspect-[4/5] animate-pulse bg-muted" />
          <div className="space-y-3 p-6">
            <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-16 w-full animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TeamGrid() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/team", { cache: "no-store" });
        const result = await response.json().catch(() => ({ data: [] }));
        if (!response.ok || result.success === false) {
          throw new Error(result.message || "Could not load the team.");
        }
        if (!cancelled) setMembers(Array.isArray(result.data) ? result.data : []);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load the team.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div>
        <p className="sr-only">Loading team profiles</p>
        <TeamSkeleton />
      </div>
    );
  }

  if (error) {
    return <p className="text-center text-destructive">{error}</p>;
  }

  if (!members.length) {
    return (
      <p className="mx-auto max-w-xl text-center text-muted-foreground">
        Team profiles will appear here once they are published from the Indonor admin.
      </p>
    );
  }

  return (
    <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-3">
      {members.map((member) => (
        <article key={member.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="relative aspect-[4/5] bg-muted">
            {member.photoUrl ? (
              // Dynamic CMS URLs can come from any host.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={member.photoUrl} alt={member.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-4xl font-semibold text-muted-foreground">
                {member.name.slice(0, 1)}
              </div>
            )}
          </div>
          <div className="space-y-3 p-6">
            <div>
              <h2 className="text-xl font-bold text-foreground">{member.name}</h2>
              <p className="text-sm font-medium text-primary">{displayRoles(member)}</p>
              {member.location ? <p className="mt-1 text-sm text-muted-foreground">{member.location}</p> : null}
            </div>
            {member.bio ? <p className="text-sm leading-relaxed text-muted-foreground">{member.bio}</p> : null}
            {member.linkedinUrl ? (
              <Link href={member.linkedinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex text-sm font-semibold text-primary hover:underline">
                LinkedIn
              </Link>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
