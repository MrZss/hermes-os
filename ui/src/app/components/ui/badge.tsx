import * as React from "react"
import { cn } from "../../lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'outline';
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex max-w-full min-w-0 items-center whitespace-normal rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors [overflow-wrap:anywhere] focus:outline-none",
        {
          "border-transparent bg-zinc-100 text-zinc-700": variant === "default",
          "border border-emerald-200/80 bg-emerald-50 text-emerald-700": variant === "success",
          "border border-amber-200/80 bg-amber-50 text-amber-700": variant === "warning",
          "border border-red-200/80 bg-red-50 text-red-700": variant === "error",
          "border-zinc-200 bg-white text-zinc-600": variant === "outline",
        },
        className
      )}
      {...props}
    />
  )
}

function StatusDot({ status, className }: { status: 'running' | 'stopped' | 'error' | 'warning', className?: string }) {
  return (
    <span className={cn("relative flex h-2 w-2", className)}>
      {status === 'running' && <span className="absolute inline-flex h-full w-full rounded-full opacity-50 animate-ping bg-emerald-500"></span>}
      <span className={cn("relative inline-flex rounded-full h-2 w-2", {
         "bg-emerald-500": status === 'running',
         "bg-zinc-300": status === 'stopped',
         "bg-red-500": status === 'error',
         "bg-amber-400": status === 'warning',
      })}></span>
    </span>
  )
}

export { Badge, StatusDot }
