import { forwardRef } from "react";
import type { SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "h-10 w-full rounded-md border border-input bg-white px-3 text-sm outline-none ring-offset-2 transition focus:ring-2 focus:ring-ring",
        className,
      )}
      {...props}
    />
  ),
);

Select.displayName = "Select";
