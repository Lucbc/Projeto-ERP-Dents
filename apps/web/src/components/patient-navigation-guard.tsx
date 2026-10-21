import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import { Button } from './ui/button';

export function PatientNavigationGuard({ when, pending, uncertain }: {
  when: boolean; pending: boolean; uncertain: boolean;
}) {
  const blocker = useBlocker(when);
  const stay = useRef<HTMLButtonElement>(null);
  const leave = useRef<HTMLButtonElement>(null);
  const blocked = blocker.state === 'blocked';
  useEffect(() => {
    if (blocked && !when) blocker.reset();
  }, [blocked, when, blocker]);
  useEffect(() => {
    if (!blocked) return;
    const previous = document.activeElement;
    stay.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [blocked]);
  if (!blocked) return null;
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
    <section role="alertdialog" aria-modal="true" aria-labelledby="patient-navigation-title"
      aria-describedby="patient-navigation-message" className="w-full max-w-lg space-y-4 rounded-lg border bg-card p-6 shadow-xl"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); blocker.reset(); }
        if (event.key === 'Tab') {
          event.preventDefault();
          if (!pending && document.activeElement === stay.current) leave.current?.focus();
          else stay.current?.focus();
        }
      }}>
      <h2 id="patient-navigation-title" className="text-lg font-semibold">Sair do cadastro?</h2>
      <p id="patient-navigation-message">{pending
        ? 'Aguarde a operação em andamento. Sair não cancela um envio já iniciado.'
        : uncertain
          ? 'O resultado do cadastro ainda não foi confirmado. Sair descarta os campos desta tela, mas não cancela o envio. Confira a tentativa ao voltar antes de repetir os dados.'
          : 'Há alterações não salvas. Sair desta página descarta essas alterações.'}</p>
      <div className="flex flex-wrap gap-3">
        <Button ref={stay} type="button" onClick={() => blocker.reset()}>Continuar preenchendo</Button>
        <Button ref={leave} type="button" variant="outline" disabled={pending} onClick={() => blocker.proceed()}>Descartar e sair</Button>
      </div>
    </section>
  </div>;
}
