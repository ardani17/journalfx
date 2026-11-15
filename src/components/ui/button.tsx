import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "purple" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-[#06281a] hover:bg-[#1fd089] font-semibold shadow-[0_0_18px_rgba(34,230,154,0.25)]",
  purple:
    "bg-indigo-soft text-white hover:bg-[#7c6fe0] font-semibold shadow-[0_0_18px_rgba(109,95,212,0.3)]",
  secondary: "bg-panel text-ink border border-line hover:border-[#3d4a66] hover:bg-panel-2",
  ghost: "text-muted hover:text-ink hover:bg-panel-2",
  danger: "bg-loss/15 text-loss border border-loss/40 hover:bg-loss/25",
  outline: "border border-line text-ink hover:border-primary/60 hover:text-primary",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs rounded-lg gap-1.5",
  md: "h-10 px-4 text-sm rounded-lg gap-2",
  lg: "h-11 px-5 text-sm rounded-xl gap-2",
  icon: "h-9 w-9 rounded-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap transition-colors",
        "focus-visible:outline-2 focus-visible:outline-primary",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
