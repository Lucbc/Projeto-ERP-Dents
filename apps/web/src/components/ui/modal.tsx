import { useId, useLayoutEffect, useRef, type PropsWithChildren, type ReactNode } from "react";

interface ModalProps extends PropsWithChildren {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
}

export function Modal({ open, title, onClose, children }: ModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useLayoutEffect(() => {
    if (!open || !dialog.current) return;
    const element = dialog.current;
    const trigger = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, [open]);
  if (!open) return null;

  return (
    <dialog ref={dialog} aria-labelledby={titleId}
      className="fixed inset-0 m-0! h-full max-h-none w-full max-w-none border-0 bg-transparent p-3 backdrop:bg-black/45 open:flex open:items-center open:justify-center md:p-4"
      onCancel={event => { event.preventDefault(); onClose(); }}
      onKeyDown={event => {
        if (event.key !== "Tab" || event.defaultPrevented
          || (event.target as Element).closest("dialog") !== event.currentTarget) return;
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'a[href],button,input,select,textarea,[tabindex]')).filter(element =>
          element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length > 0
          && getComputedStyle(element).visibility !== "hidden");
        const first = items[0], last = items[items.length - 1];
        if (first && event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (last && !event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        className="w-full max-w-3xl max-h-[calc(100vh-1.5rem)] overflow-y-auto rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xl md:max-h-[calc(100vh-2rem)] md:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="font-display text-lg font-semibold">{title}</h2>
          <button type="button" aria-label="Fechar janela" onClick={onClose} className="text-xl leading-none text-muted-foreground">
            x
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
