import { createContext, type PropsWithChildren, useContext, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error";

interface ToastData {
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: PropsWithChildren) {
  const [toastData, setToastData] = useState<ToastData | null>(null);

  const toast = (message: string, variant: ToastVariant = "success") => {
    setToastData({ message, variant });
    window.setTimeout(() => setToastData(null), 3500);
  };

  const value = useMemo(() => ({ toast }), []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toastData && (
        <div
          className={cn(
            "fixed bottom-5 right-5 z-50 rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-lg",
            toastData.variant === "success" ? "bg-emerald-600" : "bg-red-600",
          )}
        >
          {toastData.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
