import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LiveQueryStatus } from "@/components/ui/live-query-status";
import { useAuth } from "@/hooks/use-auth";
import { useLiveQuery } from "@/hooks/use-live-query";
import { usePermissions } from "@/hooks/use-permissions";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { appointmentStatusLabels } from "@/lib/labels";
import { consultationService } from "@/lib/services";
import type { Appointment, User } from "@/types";

const isolated = { exactOnDenied: true, gcTime: 0 };
type Guard = <T>(read: () => Promise<T>) => Promise<T>;
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section aria-label={title}><Card><h3 className="mb-3 font-semibold">{title}</h3>{children}</Card></section>;
}
function Visit({ appointment }: { appointment: Appointment }) {
  return <div className="mt-3 rounded-md border p-3 text-sm">
    <p className="font-semibold">{appointment.patient_name ?? "Paciente"}</p>
    <p className="text-muted-foreground">Dentista: {appointment.dentist_name ?? "-"}</p>
    <p>Início: {formatDateTime(appointment.start_at)} | Fim: {formatDateTime(appointment.end_at)}</p>
    <p>Status: {appointmentStatusLabels[appointment.status]}</p>
  </div>;
}

function Detail({ scope, patientId, guard }: { scope: string; patientId: string; guard: Guard }) {
  const query = useLiveQuery(["consultations", "patient-detail", scope, patientId],
    signal => guard(() => consultationService.getPatientDetail(patientId, undefined, signal)),
    { ...isolated, stopOnNotFound: true });
  return <Section title="Dados do paciente">
    {query.notFound ? <div role="alert">
      <p>Este paciente não está mais disponível. Os dados anteriores foram ocultados.</p>
      {query.isError && <p>Não foi possível verificar novamente. Tente mais tarde.</p>}
      <Button className="mt-3" variant="outline" disabled={!query.online || query.isFetching} onClick={query.refresh}>
        {query.isFetching ? "Verificando paciente..." : "Verificar paciente novamente"}
      </Button>
    </div> : <LiveQueryStatus query={query} subject="dados do paciente" />}
    {query.data && <div className="mt-3 space-y-4">
      <div className="rounded-md border p-3 text-sm">
        <p className="font-semibold">{query.data.patient.full_name}</p>
        <p>Nascimento: {formatDate(query.data.patient.birth_date)}</p>
        <p>CPF: {query.data.patient.cpf ?? "-"}</p>
        <p>Telefone: {query.data.patient.phone ?? "-"}</p>
        <p>E-mail: {query.data.patient.email ?? "-"}</p>
        <p>Endereço: {query.data.patient.address ?? "-"}</p>
      </div>
      <div><p className="font-semibold">Próxima consulta deste paciente</p>
        {query.data.next_appointment ? <Visit appointment={query.data.next_appointment} />
          : <p className="text-sm">Sem próxima consulta agendada para este paciente.</p>}
      </div>
    </div>}
  </Section>;
}

function Content({ scope, search, setSearch, selected, setSelected, guard }:
  { scope: string; search: string; setSearch: (value: string) => void; selected: string | null;
    setSelected: (value: string | null) => void; guard: Guard }) {
  const next = useLiveQuery(["consultations", "next", scope],
    signal => guard(() => consultationService.next(undefined, signal)), isolated);
  const patients = useLiveQuery(["consultations", "patients", scope, search],
    signal => guard(() => consultationService.listPatients({ search, limit: 100, offset: 0 }, signal)), isolated);
  return <>
    <Section title="Próxima consulta">
      <LiveQueryStatus query={next} subject="próxima consulta" />
      {next.data === null && <p className="mt-3">Não há próxima consulta agendada.</p>}
      {next.data && <Visit appointment={next.data} />}
    </Section>
    <Section title="Pacientes">
      <Input aria-label="Buscar pacientes" value={search} onChange={event => setSearch(event.target.value)}
        placeholder="Buscar por nome, CPF ou e-mail" className="mb-3 md:w-80" />
      <LiveQueryStatus query={patients} subject="pacientes da consulta" />
      {patients.data && <>
        <p className="my-3 text-sm text-muted-foreground">Exibindo {patients.data.items.length} de {patients.data.total} pacientes.
          {patients.data.total > patients.data.items.length && " Refine a busca para encontrar outros pacientes."}</p>
        {patients.data.items.length === 0 ? <p>Nenhum paciente encontrado.</p>
          : <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm">
            <thead><tr className="border-b"><th className="p-2">Paciente</th><th className="p-2">Contato</th><th className="p-2">Próxima consulta</th><th className="p-2">Ações</th></tr></thead>
            <tbody>{patients.data.items.map(item => <tr key={item.patient.id} className="border-b last:border-b-0">
              <td className="p-2 font-medium">{item.patient.full_name}</td><td className="p-2">{item.patient.phone ?? item.patient.email ?? "-"}</td>
              <td className="p-2">{item.next_appointment ? formatDateTime(item.next_appointment.start_at) : "Sem consulta futura"}</td>
              <td className="p-2"><Button variant="outline" onClick={() => setSelected(item.patient.id)}>Abrir</Button></td>
            </tr>)}</tbody>
          </table></div>}
      </>}
    </Section>
    {selected && <><Button variant="outline" onClick={() => setSelected(null)}>Fechar dados do paciente</Button>
      <Detail key={selected} scope={scope} patientId={selected} guard={guard} /></>}
  </>;
}

function Consultation({ user }: { user: User }) {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const permissions = usePermissions();
  const guard: Guard = useCallback(async read => {
    try { return await read(); }
    catch (error) {
      if (isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0)) setDenied(true);
      throw error;
    }
  }, []);
  useEffect(() => { if (denied) client.removeQueries({ queryKey: ["consultations"] }); }, [denied, client]);
  if (denied) return <p role="alert">Sem permissão para acessar a consulta. Entre novamente nesta página após revisar o acesso.</p>;
  if (!permissions.can("consultations", "view")) return <p role="alert">Sem permissão para acessar a consulta.</p>;
  return <div className="space-y-4">
    <Card><h2 className="font-display text-xl font-semibold">Consulta</h2>
      <p className="text-sm text-muted-foreground">Próxima consulta e dados dos pacientes. Cada seção informa sua última atualização.</p></Card>
    <Content scope={`${user.id}:${user.dentist_id}`} search={search} setSearch={setSearch} selected={selected} setSelected={setSelected} guard={guard} />
  </div>;
}

export function ConsultationPage() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role !== "dentist") return <p role="alert">Sem permissão para acessar esta página.</p>;
  if (!user.dentist_id) return <p role="alert">Seu usuário não tem vínculo com um dentista. Solicite a revisão do cadastro.</p>;
  return <Consultation key={`${user.id}:${user.dentist_id}`} user={user} />;
}
