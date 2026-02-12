import type { PropsWithChildren } from "react";

import { cn } from "@/lib/utils";

interface CardProps extends PropsWithChildren {
  className?: string;
}

export function Card({ className, children }: CardProps) {
  return <div className={cn("rounded-xl border bg-white p-5 shadow-sm", className)}>{children}</div>;
}
