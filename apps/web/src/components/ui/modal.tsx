import type { PropsWithChildren, ReactNode } from "react";

interface ModalProps extends PropsWithChildren {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
}

export function Modal({ open, title, onClose, children }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-3 md:p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[calc(100vh-1.5rem)] overflow-y-auto rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xl md:max-h-[calc(100vh-2rem)] md:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-xl leading-none text-muted-foreground">
            x
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
