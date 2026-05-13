import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, meta, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-3 border-b border-zinc-200/70 pb-4 md:flex-row md:items-end md:justify-between", className)}>
      <div className="min-w-0">
        {meta ? <div className="mb-2 flex items-center gap-2 text-xs text-zinc-500">{meta}</div> : null}
        <h1 className="text-[21px] font-semibold tracking-tight text-zinc-950">{title}</h1>
        {description ? <p className="mt-1.5 max-w-3xl text-sm leading-6 text-zinc-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2 md:justify-end">{actions}</div> : null}
    </div>
  );
}
