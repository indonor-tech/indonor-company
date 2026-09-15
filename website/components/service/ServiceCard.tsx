import { ReactNode } from "react";

interface Props {
  icon: ReactNode;
  title: string;
  description: string;
}

export default function ServiceCard({ icon, title, description }: Props) {
  return (
    <div className="
    group
    p-8
    rounded-2xl
    border border-border
    bg-card text-card-foreground
    hover:border-primary/30
    hover:shadow-xl
    hover:-translate-y-2
    transition-all duration-300
    ">

      <div className="
      w-14 h-14
      flex items-center justify-center
      rounded-xl
      bg-primary/10
      text-primary
      mb-5
      group-hover:bg-primary
      group-hover:text-primary-foreground
      transition
      ">
        {icon}
      </div>

      <h3 className="text-xl font-semibold mb-3">
        {title}
      </h3>

      <p className="text-muted-foreground text-sm leading-relaxed">
        {description}
      </p>

    </div>
  );
}