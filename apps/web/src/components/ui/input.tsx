import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none ring-offset-2 transition focus:ring-2 focus:ring-ring placeholder:text-muted-foreground",
        className,
      )}
      {...props}
    />
  ),
);

Input.displayName = "Input";
