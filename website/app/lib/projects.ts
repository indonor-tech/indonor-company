export type ProjectVideo =
  | { type: "youtube"; id: string }
  | { type: "vimeo"; id: string }
  | { type: "file"; src: string };

export type ClientProject = {
  id: string;
  title: string;
  client: string;
  summary: string;
  details: string[];
  url: string;
  tags: string[];
  video?: ProjectVideo | null;
  coverImage?: string;
  featured?: boolean;
  status?: "COMPLETED" | "IN_PROGRESS";
  displayOrder?: number;
};

export async function fetchWebsiteProjects(): Promise<ClientProject[]> {
  const response = await fetch("/api/projects", { cache: "no-store" });
  const result = await response.json().catch(() => ({ data: [] }));
  if (!response.ok || result.success === false) {
    throw new Error(result.message || "Could not load projects.");
  }
  return Array.isArray(result.data) ? result.data : [];
}

export function projectCounts(projects: ClientProject[]) {
  const ongoing = projects.filter((project) => project.status === "IN_PROGRESS").length;
  const done = projects.filter((project) => project.status !== "IN_PROGRESS").length;
  return { done, ongoing, total: projects.length };
}

export function featuredProjects(projects: ClientProject[], limit = 6) {
  const selected = projects.filter((project) => project.featured !== false);
  return (selected.length ? selected : projects).slice(0, limit);
}

export function projectStatusLabel(status?: ClientProject["status"]) {
  return status === "IN_PROGRESS" ? "In progress" : "Completed";
}
