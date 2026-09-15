"use client";

import type { ProjectVideo } from "@/lib/projects";

type Props = {
  video: ProjectVideo;
  title: string;
};

export default function ProjectVideo({ video, title }: Props) {
  if (video.type === "youtube") {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${video.id}?rel=0`}
          title={`${title} demo video`}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }

  if (video.type === "vimeo") {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted">
        <iframe
          src={`https://player.vimeo.com/video/${video.id}`}
          title={`${title} demo video`}
          className="absolute inset-0 h-full w-full"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted">
      <video
        className="h-full w-full object-cover"
        controls
        preload="metadata"
        playsInline
      >
        <source src={video.src} />
        Your browser does not support the video tag.
      </video>
    </div>
  );
}
