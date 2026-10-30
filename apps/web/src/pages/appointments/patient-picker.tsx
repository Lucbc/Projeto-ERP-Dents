import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { patientService } from "@/lib/services";
import { formatDate } from "@/lib/datetime";
import type { Patient } from "@/types";
import { PATIENT_PAGE_SIZE, type usePatientReferences } from "./use-patient-references";

type Source = ReturnType<typeof usePatientReferences>;
const label = (p: Patient) => [p.full_name, p.birth_date ? formatDate(p.birth_date) : "", p.cpf ? `CPF ${p.cpf}` : ""].filter(Boolean).join(" · ") + (p.active === false ? " (inativo)" : "");

export function PatientPicker({ source, value, onChange, name, emptyLabel = "Selecione", labelText = "Paciente" }:
  { source: Source; value: string; onChange: (id: string) => void; name?: string; emptyLabel?: string; labelText?: string }) {
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; items: Patient[]; total: number; error?: boolean }>();
  const key = JSON.stringify([source.action, search, offset, retry]);
  const needsSearch = !!search.trim() || offset > 0;
  useEffect(() => {
    if (!source.ready || !needsSearch) { setResult(undefined); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void patientService.list({ search: search.trim(), offset, limit: PATIENT_PAGE_SIZE }, controller.signal).then(page => {
        if (!controller.signal.aborted) setResult({ key, ...page });
      }).catch(error => {
        if (controller.signal.aborted) return;
        if (isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0)) source.deny();
        setResult({ key, items: [], total: 0, error: true });
      });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, source.ready, source.deny, needsSearch, search, offset]);
  const page = needsSearch ? result?.key === key ? result : undefined
    : { items: source.items.slice(0, PATIENT_PAGE_SIZE), total: source.total };
  const selected = source.items.find(item => item.id === value);
  const rows = source.ready ? page?.items ?? [] : [];
  const options = selected && !rows.some(item => item.id === selected.id) ? [selected, ...rows] : rows;
  return <div className="space-y-2">
    <Input aria-label={`Buscar ${labelText.toLowerCase()}`} placeholder="Buscar por nome, CPF ou telefone"
      value={search} disabled={!source.ready} onChange={e => { setSearch(e.target.value); setOffset(0); }}
      onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }} />
    <Select searchable={false} aria-label={labelText} name={name} value={value} disabled={!source.ready}
      onChange={e => {
        const patient = options.find(item => item.id === e.target.value);
        if (patient) source.remember(patient);
        onChange(e.target.value);
      }}>
      <option value="">{emptyLabel}</option>
      {value && !options.some(item => item.id === value) && <option value={value}>Paciente selecionado indisponível</option>}
      {options.map(item => <option key={item.id} value={item.id}>{label(item)}</option>)}
    </Select>
    <p role="status" className="text-xs text-muted-foreground">{!source.ready ? "Aguardando cadastros do paciente."
      : !page ? "Buscando pacientes..." : "error" in page && page.error ? "Não foi possível buscar pacientes. Tente novamente."
      : `Exibindo ${rows.length} de ${page.total} resultados. Use a busca ou avance a página. A seleção atual é mantida.`}</p>
    {page && "error" in page && page.error && <Button type="button" variant="outline" onClick={() => setRetry(n => n+1)}>Tentar busca novamente</Button>}
    <div className="flex gap-2">
      <Button type="button" variant="outline" disabled={!source.ready || offset === 0} onClick={() => setOffset(n => Math.max(0, n-PATIENT_PAGE_SIZE))}>Pacientes anteriores</Button>
      <Button type="button" variant="outline" disabled={!source.ready || !page || offset+PATIENT_PAGE_SIZE >= page.total} onClick={() => setOffset(n => n+PATIENT_PAGE_SIZE)}>Mais pacientes</Button>
    </div>
  </div>;
}
