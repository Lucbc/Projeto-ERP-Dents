import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/states";
import { LiveQueryStatus } from "@/components/ui/live-query-status";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { useLiveQuery } from "@/hooks/use-live-query";
import { accessAuditService, auditActions, type AuditEvent, type AuditFilters } from "@/lib/access-audit-service";
import { formatDateTime, fromInputDateTime } from "@/lib/datetime";

const targetLabels = {
  "clinical.record_read": "Registro", "clinical.appointment_read": "Agendamento",
  "clinical.patient_list": "Paciente consultado", "exam.download_prepared": "Exame",
};
const blank = { action: "", author_id: "", patient_id: "", target_id: "", since: "", until: "" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function EventView({ event }: { event: AuditEvent }) {
  return <article aria-label={auditActions[event.action]} className="space-y-2 rounded-md border p-4 break-words">
    <h2 className="font-semibold">{auditActions[event.action]}</h2>
    <p>{formatDateTime(event.occurred_at)} · Horário de São Paulo</p>
    <p>Responsável (ID): {event.actor_id}</p>
    <p>{event.patient_id ? `Paciente (ID): ${event.patient_id}` : "Paciente não identificado nesta consulta."}</p>
    <p>{targetLabels[event.action]} (ID): {event.target_id}</p>
    {event.action === "exam.download_prepared" ?
      <p>Arquivo preparado para resposta. Não confirma transmissão ou recebimento.</p> : <>
        <p>Registros retornados: {event.returned_count}</p>
        {event.page_limit !== null && <p>Consulta original: limite {event.page_limit} · deslocamento {event.page_offset}</p>}
        {event.record_ids.length > 0 && <details><summary className="cursor-pointer">IDs e versões dos registros</summary>
          <ul className="space-y-1">{event.record_ids.map((id, index) => <li key={id}>{id} · Versão {event.record_versions[index]}</li>)}</ul>
        </details>}
      </>}
    <details><summary className="cursor-pointer">Identificador do evento</summary><p>{event.id}</p></details>
  </article>;
}

function Results({ userId, filters, cursor, page, previous, next, reset, onDenied }: {
  userId: string; filters: AuditFilters; cursor: string | null; page: number;
  previous: () => void; next: (cursor: string) => void; reset: () => void; onDenied: () => void;
}) {
  const query = useLiveQuery(["access-audit", userId, filters, cursor],
    signal => accessAuditService.list(filters, cursor, signal), { exactOnDenied: true, gcTime: 0 });
  useEffect(() => { if (query.accessDenied) onDenied(); }, [query.accessDenied, onDenied]);
  if (query.accessDenied) return <ErrorState message="Seu acesso ao histórico de acessos foi encerrado." />;
  return <section aria-label="Acessos registrados" className="space-y-4">
    <LiveQueryStatus subject="histórico" query={{ ...query, refresh: () => { if (page > 1) reset(); else query.refresh(); } }} />
    {query.isPending && query.isFetching && <p role="status">Carregando eventos...</p>}
    {query.data && <>
      <p>Página {page} · {query.data.items.length} eventos. Atualizar o histórico retorna à primeira página.</p>
      {query.data.items.length === 0 && <p>Nenhum evento encontrado para estes filtros.</p>}
      {query.data.items.map(event => <EventView key={event.id} event={event} />)}
    </>}
    <div className="flex gap-3">
      <Button variant="outline" disabled={page === 1 || query.isFetching} onClick={previous}>Página anterior</Button>
      <Button variant="outline" disabled={!query.data?.next_cursor || query.isFetching || query.isError || !query.online}
        onClick={() => { if (query.data?.next_cursor) next(query.data.next_cursor); }}>Próxima página</Button>
    </div>
  </section>;
}

function Reader({ userId }: { userId: string }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState(blank);
  const [filters, setFilters] = useState<AuditFilters>({});
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const onDenied = useCallback(() => setDenied(true), []);
  useEffect(() => {
    const clear = () => {
      void client.cancelQueries({ queryKey: ["access-audit", userId] });
      client.removeQueries({ queryKey: ["access-audit", userId] });
    };
    if (denied) clear();
    return clear;
  }, [client, userId, denied]);
  if (denied) return <ErrorState message="Seu acesso ao histórico de acessos foi encerrado. Reabra a página após revisar as permissões." />;
  const apply = (event: FormEvent) => {
    event.preventDefault();
    try {
      const values = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()]));
      for (const key of ["author_id", "patient_id", "target_id"]) if (values[key] && !uuid.test(values[key])) throw new Error("Informe um ID válido de responsável, paciente ou alvo.");
      const since = values.since ? fromInputDateTime(values.since) : undefined;
      const until = values.until ? fromInputDateTime(values.until) : undefined;
      if (since && until && Date.parse(since) >= Date.parse(until)) throw new Error("O fim do período deve ser posterior ao início.");
      setFilters({ ...Object.fromEntries(Object.entries(values).filter(([key, value]) => value && key !== "since" && key !== "until")), since, until } as AuditFilters);
      setCursors([null]); setError("");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Revise os filtros."); }
  };
  const cursor = cursors[cursors.length - 1];
  const selectClass = "w-full rounded-md border bg-background p-2 text-foreground";
  return <div className="space-y-4">
    <Card><h1 className="text-xl font-semibold">Histórico de acessos</h1>
      <p>Consultas clínicas autorizadas e downloads preparados desde a implantação deste histórico, sem copiar conteúdo clínico ou arquivos. Atualizações automáticas também geram eventos. Esta lista não comprova leitura humana nem recebimento do arquivo. Os IDs permanecem após exclusões.</p>
      <form onSubmit={apply} className="mt-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div><label htmlFor="audit-action">Ação</label><select id="audit-action" className={selectClass} value={draft.action} onChange={e => setDraft({ ...draft, action: e.target.value })}>
            <option value="">Todas</option>{Object.entries(auditActions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></div>
          <label>Responsável (ID)<Input value={draft.author_id} onChange={e => setDraft({ ...draft, author_id: e.target.value })} maxLength={36} /></label>
          <label>Paciente (ID)<Input value={draft.patient_id} onChange={e => setDraft({ ...draft, patient_id: e.target.value })} maxLength={36} /></label>
          <label>Alvo (ID)<Input value={draft.target_id} onChange={e => setDraft({ ...draft, target_id: e.target.value })} maxLength={36} /></label>
          <label>Desde (São Paulo)<Input type="datetime-local" value={draft.since} onChange={e => setDraft({ ...draft, since: e.target.value })} /></label>
          <label>Até, sem incluir (São Paulo)<Input type="datetime-local" value={draft.until} onChange={e => setDraft({ ...draft, until: e.target.value })} /></label>
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="flex gap-3"><Button type="submit">Aplicar filtros</Button>
          <Button type="button" variant="outline" onClick={() => { setDraft(blank); setFilters({}); setCursors([null]); setError(""); }}>Limpar filtros</Button></div>
      </form>
    </Card>
    <Results key={JSON.stringify([filters, cursor])} userId={userId} filters={filters} cursor={cursor} page={cursors.length}
      previous={() => setCursors(value => value.slice(0, -1))} next={value => setCursors(old => [...old, value])}
      reset={() => setCursors([null])} onDenied={onDenied} />
  </div>;
}

export function AccessAuditPage() {
  const { user } = useAuth();
  const { can } = usePermissions();
  return user && can("access_audit", "view") ? <Reader key={user.id} userId={user.id} />
    : <ErrorState message="Sem permissão para consultar o histórico de acessos." />;
}
