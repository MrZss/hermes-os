import * as React from "react"
import { cn } from "../../lib/utils"

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "min-w-0 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white text-zinc-900 shadow-[0_4px_24px_rgba(15,23,42,0.03)] [overflow-wrap:anywhere]",
        className
      )}
      {...props}
    />
  )
)
Card.displayName = "Card"

export { Card }
