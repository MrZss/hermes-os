import * as React from "react"
import { cn } from "../../lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-[#2563eb] text-white hover:bg-[#1d4ed8] shadow-[0_4px_14px_rgba(37,99,235,0.16)]": variant === "primary",
            "bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50 shadow-[0_1px_2px_rgba(0,0,0,0.02)]": variant === "secondary",
            "bg-transparent text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900": variant === "ghost",
            "bg-white text-red-700 border border-red-200 hover:bg-red-50 hover:border-red-300 shadow-sm": variant === "danger",
            "h-8 px-3 text-xs": size === "sm",
            "h-9 px-4 py-2": size === "md",
            "h-10 px-6": size === "lg",
            "h-9 w-9 p-0": size === "icon",
          },
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
