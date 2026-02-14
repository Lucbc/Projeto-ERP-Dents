import type { PropsWithChildren } from "react";

import { cn } from "@/lib/utils";

interface CardProps extends PropsWithChildren {
  className?: string;
}

export function Card({ className, children }: CardProps) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm", className)}>
      {children}
    </div>
  );
}
