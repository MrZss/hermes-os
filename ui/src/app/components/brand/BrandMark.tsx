import { cn } from "../../lib/utils";

interface BrandMarkProps {
  className?: string;
  imageClassName?: string;
}

export function BrandMark({ className, imageClassName }: BrandMarkProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden bg-slate-950",
        className
      )}
      aria-hidden="true"
    >
      <img
        src="/brand/hermes-console.svg"
        alt=""
        draggable={false}
        className={cn("h-full w-full select-none object-cover", imageClassName)}
      />
    </span>
  );
}
