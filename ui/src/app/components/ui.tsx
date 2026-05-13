import React from "react";
import { cn } from "../utils/cn";
import { Loader2 } from "lucide-react";

// Button
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading, children, disabled, ...props }, ref) => {
    const variants = {
      primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-sm border border-transparent",
      secondary: "bg-white text-stone-700 hover:bg-stone-50 border border-stone-200 shadow-sm",
      outline: "bg-transparent text-stone-600 hover:text-stone-900 border border-stone-200 hover:bg-stone-50",
      ghost: "bg-transparent text-stone-600 hover:text-stone-900 hover:bg-stone-100",
      danger: "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200",
    };
    const sizes = {
      sm: "h-8 px-3 text-xs rounded-md",
      md: "h-9 px-4 text-sm rounded-lg",
      lg: "h-11 px-6 text-base rounded-xl",
      icon: "h-8 w-8 flex items-center justify-center rounded-md p-0",
    };
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

// Card
export const Card = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("bg-white border border-stone-200 rounded-xl shadow-sm overflow-hidden", className)} {...props}>
    {children}
  </div>
);

// Badge
export const Badge = ({ className, variant = "default", children, ...props }: React.HTMLAttributes<HTMLSpanElement> & { variant?: "default" | "success" | "warning" | "danger" | "info" | "outline" }) => {
  const variants = {
    default: "bg-stone-100 text-stone-700 border border-stone-200",
    success: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border border-amber-200",
    danger: "bg-red-50 text-red-700 border border-red-200",
    info: "bg-blue-50 text-blue-700 border border-blue-200",
    outline: "bg-transparent border border-stone-200 text-stone-600"
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium tracking-wide", variants[variant], className)} {...props}>
      {children}
    </span>
  );
};

// Input
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-9 w-full rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-900 placeholder:text-stone-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

// Label
export const Label = ({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn("text-sm font-medium leading-none text-stone-700 peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)} {...props} />
);

// Switch
export const Switch = ({ checked, onChange }: { checked?: boolean, onChange?: () => void }) => (
  <button 
    role="switch" 
    aria-checked={checked} 
    onClick={onChange}
    className={cn(
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
      checked ? "bg-blue-600" : "bg-stone-300"
    )}
  >
    <span className={cn("pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform", checked ? "translate-x-4" : "translate-x-0")} />
  </button>
);
