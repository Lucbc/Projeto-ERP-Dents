import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { LiveQueryStatus } from "@/components/ui/live-query-status";
import { useAuth } from "@/hooks/use-auth";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useLocalDay } from "@/hooks/use-local-day";
import { appointmentStatusLabels } from "@/lib/labels";
import { appointmentService, dentistService, patientService, permissionService } from "@/lib/services";
import type { PermissionResource, User } from "@/types";

const isolated = { exactOnDenied: true, gcTime: 0 };

function Indicator({ title, children }: { title: string; children: ReactNode }) {
  return <section aria-label={title}><Card><h2 className="mb-3 font-semibold">{title}</h2>{children}</Card></section>;
}

function Count({ resource, userId }: { resource: "patients" | "dentists"; userId: string }) {
  const query = useLiveQuery([resource, "dashboard-count", userId], signal =>
    (resource === "patients" ? patientService : dentistService).list({ limit: 1, offset: 0 }, signal)
      .then(result => result.total), isolated);
  const subject = resource === "patients" ? "pacientes" : "dentistas";
  return query.accessDenied ? <p role="alert">Sem permissão para consultar {subject}. Entre novamente nesta página após revisar o acesso.</p>
    : <><p className="mb-3 text-3xl font-bold">{query.data ?? "—"}</p><LiveQueryStatus query={query} subject={subject} /></>;
}

function Today({ userId }: { userId: string }) {
  const day = useLocalDay();
  const query = useLiveQuery(["appointments", "dashboard-today", userId, day.from, day.to],
    signal => appointmentService.list(day, signal), isolated);
  if (query.accessDenied) return <p role="alert">Sem permissão para consultar a agenda. Entre novamente nesta página após revisar o acesso.</p>;
  return <>
    <p className="mb-3 text-3xl font-bold">{query.data?.length ?? "—"}</p>
    <LiveQueryStatus query={query} subject="consultas de hoje" />
    {query.data?.length === 0 && <p className="mt-3 text-sm">Nenhuma consulta para hoje.</p>}
    {query.data && query.data.length > 0 && <div className="mt-3 space-y-2">
      {query.data.map(appointment => <div key={appointment.id} className="rounded-md border p-3 text-sm">
        <p className="font-semibold">{appointment.patient_name ?? "Paciente"}</p>
        <p className="text-muted-foreground">Dentista: {appointment.dentist_name ?? "-"} | {new Date(appointment.start_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} - {new Date(appointment.end_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
        <p>Status: {appointmentStatusLabels[appointment.status]}</p>
      </div>)}
    </div>}
  </>;
}

function Dashboard({ user }: { user: User }) {
  // Remains mounted when access is unknown/denied so permission recovery can run.
  // The outer authenticated route and server still enforce session validity.
  const permissions = useLiveQuery(["permissions", "me", user.id], signal => permissionService.me(signal),
    { enabled: user.role !== "admin", exactOnDenied: true });
  if (user.role !== "admin") {
    if (permissions.accessDenied) return <p role="alert">Sem permissão para acessar esta página. Entre novamente após revisar o acesso.</p>;
    if (permissions.isError || !permissions.data) return <section aria-label="Permissões do painel">
      <p className="mb-3">Os indicadores estão ocultos até verificar as permissões.</p>
      <LiveQueryStatus query={permissions} subject="permissões" />
    </section>;
    if (!permissions.data.permissions.dashboard?.view) return <p role="alert">Sem permissão para acessar esta página.</p>;
  }
  const can = (resource: PermissionResource) => user.role === "admin" || Boolean(permissions.data?.permissions[resource]?.view);
  return <div className="space-y-6">
    <header><h1 className="font-display text-2xl font-semibold">Painel</h1>
      <p className="text-sm text-muted-foreground">Visão geral da clínica. Cada indicador informa sua última atualização.</p></header>
    <div className="grid gap-4 md:grid-cols-2">
      <Indicator title="Pacientes cadastrados">{can("patients") ? <Count resource="patients" userId={user.id} /> : <p>Sem permissão para consultar pacientes.</p>}</Indicator>
      <Indicator title="Dentistas cadastrados">{can("dentists") ? <Count resource="dentists" userId={user.id} /> : <p>Sem permissão para consultar dentistas.</p>}</Indicator>
    </div>
    <Indicator title="Consultas de hoje">{can("appointments") ? <Today userId={user.id} /> : <p>Sem permissão para consultar a agenda.</p>}</Indicator>
  </div>;
}

export function DashboardPage() {
  const { user } = useAuth();
  return user ? <Dashboard key={user.id} user={user} /> : null;
}
