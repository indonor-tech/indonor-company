import Link from "next/link";
import { ExternalLink, PlayCircle } from "lucide-react";
import { projectStatusLabel, type ClientProject } from "@/lib/projects";
import ProjectVideo from "./ProjectVideo";

type Props = {
  project: ClientProject;
};

export default function ProjectCard({ project }: Props) {
  return (
    <article className="grid gap-8 lg:grid-cols-2 lg:gap-12 items-start border-b border-border pb-16 last:border-b-0 last:pb-0">
      <div className="space-y-4">
        {project.video ? (
          <ProjectVideo video={project.video} title={project.title} />
        ) : project.coverImage ? (
          <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted">
            {/* Dynamic CMS URLs can come from any host. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={project.coverImage}
              alt={`${project.title} preview`}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/35">
              <div className="flex items-center gap-2 rounded-full bg-background/90 px-4 py-2 text-sm font-medium text-foreground">
                <PlayCircle className="h-4 w-4 text-primary" />
                Demo video coming soon
              </div>
            </div>
          </div>
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-dashed border-border bg-muted/50 text-sm text-muted-foreground">
            Add a video or cover image for this project
          </div>
        )}
      </div>

      <div className="space-y-5">
        <div>
          <p className="text-sm font-semibold tracking-wide text-primary">
            {project.client}
          </p>
          <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${project.status === "IN_PROGRESS" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
            {projectStatusLabel(project.status)}
          </span>
          <h3 className="mt-2 text-2xl md:text-3xl font-bold text-foreground">
            {project.title}
          </h3>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            {project.summary}
          </p>
        </div>

        <ul className="space-y-2">
          {project.details.map((item) => (
            <li
              key={item}
              className="flex gap-3 text-sm text-foreground/85 leading-relaxed"
            >
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span>{item}</span>
            </li>
          ))}
        </ul>

        {project.tags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {project.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs font-medium text-muted-foreground border border-border px-2.5 py-1 rounded-md"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        {project.url ? (
        <Link
          href={project.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Visit client project
          <ExternalLink className="h-4 w-4" />
        </Link>
        ) : null}
      </div>
    </article>
  );
}
