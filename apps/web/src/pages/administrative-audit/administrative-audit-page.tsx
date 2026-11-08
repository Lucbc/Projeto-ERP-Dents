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
import { administrativeAuditService, auditActions, type AuditEvent, type AuditFilters } from "@/lib/administrative-audit-service";
import { formatDateTime, fromInputDateTime } from "@/lib/datetime";
import { permissionResourceLabels, permissionActionLabels, userRoleLabels } from "@/lib/labels";
import type { PermissionResource, PermissionAction } from "@/types";

const fields: Record<string, string> = { name: "Nome", email: "E-mail", role: "Perfil", dentist_id: "Dentista vinculado", is_active: "Situação ativa" };
const blank = { action: "", author_id: "", target_user_id: "", target_role: "", since: "", until: "" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function EventView({ event }: { event: AuditEvent }) {
  return <article aria-label={auditActions[event.action]} className="space-y-2 rounded-md border p-4 break-words">
    <h2 className="font-semibold">{auditActions[event.action]}</h2>
    <p>{formatDateTime(event.occurred_at)} · Horário de São Paulo</p>
    <p>Responsável (ID): {event.actor_id}</p>
    <p>{event.target_user_id ? `Usuário afetado (ID): ${event.target_user_id}` : `Perfil afetado: ${event.target_role ? userRoleLabels[event.target_role] : "—"}`}</p>
    <p>Versão anterior: {event.before_version ?? "—"} · Versão posterior: {event.after_version ?? "—"}</p>
    {event.changed_fields.length > 0 && <p>Campos: {event.changed_fields.map(field => fields[field] ?? field).join(", ")}</p>}
    {event.permission_changes.length > 0 && <ul className="list-disc pl-5">{event.permission_changes.map(change =>
      <li key={`${change.resource}:${change.action}`}>{permissionResourceLabels[change.resource as PermissionResource] ?? change.resource} · {permissionActionLabels[change.action as PermissionAction] ?? change.action}: {change.before ? "Permitido" : "Negado"} → {change.after ? "Permitido" : "Negado"}</li>)}</ul>}
    {!event.changed_fields.length && !event.permission_changes.length && <p>{event.action === "user.password_reset" ? "Redefinição registrada; a senha não faz parte do histórico." : "Operação registrada sem diferença de campos exibível."}</p>}
    <details><summary className="cursor-pointer">Identificador do evento</summary><p>{event.id}</p></details>
  </article>;
}

function Results({ userId, filters, cursor, page, previous, next, reset, onDenied }: {
  userId: string; filters: AuditFilters; cursor: string | null; page: number;
  previous: () => void; next: (cursor: string) => void; reset: () => void; onDenied: () => void;
}) {
  const query = useLiveQuery(["administrative-audit", userId, filters, cursor],
    signal => administrativeAuditService.list(filters, cursor, signal), { exactOnDenied: true, gcTime: 0 });
  useEffect(() => { if (query.accessDenied) onDenied(); }, [query.accessDenied, onDenied]);
  if (query.accessDenied) return <ErrorState message="Seu acesso ao histórico administrativo foi encerrado." />;
  return <section aria-label="Eventos administrativos" className="space-y-4">
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
      void client.cancelQueries({ queryKey: ["administrative-audit", userId] });
      client.removeQueries({ queryKey: ["administrative-audit", userId] });
    };
    if (denied) clear();
    return clear;
  }, [client, userId, denied]);
  if (denied) return <ErrorState message="Seu acesso ao histórico administrativo foi encerrado. Reabra a página após revisar as permissões." />;
  const apply = (event: FormEvent) => {
    event.preventDefault();
    try {
      const values = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()]));
      for (const key of ["author_id", "target_user_id"]) if (values[key] && !uuid.test(values[key])) throw new Error("Informe um ID válido de usuário.");
      if (values.target_user_id && values.target_role) throw new Error("Filtre por usuário afetado ou perfil, não ambos.");
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
    <Card><h1 className="text-xl font-semibold">Histórico administrativo</h1>
      <p>Alterações de usuários e permissões. Os IDs preservam a referência mesmo após excluir uma conta; nomes e senhas não são copiados para este histórico.</p>
      <form onSubmit={apply} className="mt-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div><label htmlFor="audit-action">Ação</label><select id="audit-action" className={selectClass} value={draft.action} onChange={e => setDraft({ ...draft, action: e.target.value })}>
            <option value="">Todas</option>{Object.entries(auditActions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></div>
          <label>Responsável (ID)<Input value={draft.author_id} onChange={e => setDraft({ ...draft, author_id: e.target.value })} maxLength={36} /></label>
          <label>Usuário afetado (ID)<Input value={draft.target_user_id} onChange={e => setDraft({ ...draft, target_user_id: e.target.value })} maxLength={36} /></label>
          <div><label htmlFor="audit-role">Perfil afetado</label><select id="audit-role" className={selectClass} value={draft.target_role} onChange={e => setDraft({ ...draft, target_role: e.target.value })}>
            <option value="">Todos</option>{Object.entries(userRoleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></div>
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

export function AdministrativeAuditPage() {
  const { user } = useAuth();
  const { can } = usePermissions();
  return user && can("administrative_audit", "view") ? <Reader key={user.id} userId={user.id} />
    : <ErrorState message="Sem permissão para consultar o histórico administrativo." />;
}
