import { useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import { patientService } from '@/lib/services';
import { formatDate } from '@/lib/datetime';
import { Button } from '@/components/ui/button';

type Props = { fullName: string; birthDate: string; cpf: string; onDenied: () => void };
type Result = Awaited<ReturnType<typeof patientService.duplicateCheck>>;

// The keyed child discards results immediately when identifying fields change.
export function PatientDuplicateCheck(props: Props) {
  return <DuplicateCheck key={JSON.stringify([props.fullName, props.birthDate, props.cpf])} {...props} />;
}

function DuplicateCheck({ fullName, birthDate, cpf, onDenied }: Props) {
  const [result, setResult] = useState<Result | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const eligible = (/^[0-9.\s-]+$/.test(cpf) && cpf.replace(/\D/g, '').length === 11) ||
    (fullName.trim().length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(birthDate));
  useEffect(() => {
    if (!eligible) return;
    const controller = new AbortController();
    let active = true;
    setFailed(false); setResult(null);
    const timer = setTimeout(() => {
      void patientService.duplicateCheck({ full_name: fullName, birth_date: birthDate || null, cpf: cpf || null }, controller.signal)
        .then(data => { if (active) setResult(data); })
        .catch(error => {
          if (!active) return;
          if (isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0)) { onDenied(); return; }
          setFailed(true);
        });
    }, 400);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [eligible, fullName, birthDate, cpf, onDenied, attempt]);

  return <section aria-label="Conferência de duplicidade" className="md:col-span-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm" aria-live="polite">
    <p className="font-semibold">Confira se a pessoa já possui cadastro</p>
    {!eligible && <p>Informe CPF completo ou nome completo e nascimento para conferir possíveis duplicidades.</p>}
    {eligible && !result && !failed && <p>Conferindo cadastros existentes…</p>}
    {failed && <><p role="alert">Não foi possível conferir duplicidades. Pesquise os cadastros antes de salvar.</p>
      <Button type="button" variant="outline" onClick={() => setAttempt(value => value + 1)}>Tentar conferir novamente</Button></>}
    {result && result.total === 0 && <p>{result.checked ? 'Nenhuma correspondência pelos dados informados. Isso não garante que a pessoa ainda não tenha cadastro.' : 'Informe CPF completo ou nome completo e nascimento para conferir.'}</p>}
    {result && result.total > 0 && <>
      <p role="alert">Encontramos {result.total} possível(is) cadastro(s) da mesma pessoa. Confira antes de salvar.</p>
      <ul className="my-2 list-disc pl-5">{result.items.map(item => <li key={item.id}>
        {item.full_name} — {item.birth_date ? formatDate(item.birth_date) : 'Nascimento não informado'} — {item.active ? 'Ativo' : 'Inativo'} — {item.same_cpf ? 'Mesmo CPF' : 'Mesmo nome e nascimento'}
      </li>)}</ul>
      {result.total > result.items.length && <p>Exibindo {result.items.length} de {result.total}. Use a busca da lista para conferir os demais.</p>}
      <p>Se a coincidência for apenas de nome e nascimento, você pode continuar o cadastro de outra pessoa. CPF já usado, inclusive em cadastro inativo, precisa ser corrigido antes de salvar. Nenhum registro será unido automaticamente.</p>
    </>}
  </section>;
}
