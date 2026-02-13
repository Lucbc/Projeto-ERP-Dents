import { useQuery } from "@tanstack/react-query";

import { Card } from "@/components/ui/card";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { appointmentService, dentistService, patientService } from "@/lib/services";

export function DashboardPage() {
  const patientsQuery = useQuery({
    queryKey: ["patients", "dashboard-count"],
    queryFn: () => patientService.list({ limit: 1, offset: 0 }),
  });

  const dentistsQuery = useQuery({
    queryKey: ["dentists", "dashboard-count"],
    queryFn: () => dentistService.list({ limit: 1, offset: 0 }),
  });

  const appointmentsQuery = useQuery({
    queryKey: ["appointments", "dashboard-today"],
    queryFn: () => {
      const now = new Date();
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return appointmentService.list({ from: start.toISOString(), to: end.toISOString() });
    },
  });

  const isLoading = patientsQuery.isLoading || dentistsQuery.isLoading || appointmentsQuery.isLoading;
  const isError = patientsQuery.isError || dentistsQuery.isError || appointmentsQuery.isError;

  if (isLoading) return <LoadingState message="Carregando painel..." />;
  if (isError) return <ErrorState message="Não foi possível carregar os indicadores." />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-800">Painel</h1>
        <p className="text-sm text-slate-500">Visão geral rápida da clínica.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">Pacientes cadastrados</p>
          <p className="mt-2 text-3xl font-bold text-slate-800">{patientsQuery.data?.total ?? 0}</p>
        </Card>

        <Card>
          <p className="text-sm text-slate-500">Dentistas cadastrados</p>
          <p className="mt-2 text-3xl font-bold text-slate-800">{dentistsQuery.data?.total ?? 0}</p>
        </Card>

        <Card>
          <p className="text-sm text-slate-500">Consultas hoje</p>
          <p className="mt-2 text-3xl font-bold text-slate-800">{appointmentsQuery.data?.length ?? 0}</p>
        </Card>
      </div>

      <Card>
        <p className="mb-3 text-sm font-semibold text-slate-700">Próximas consultas de hoje</p>
        {appointmentsQuery.data && appointmentsQuery.data.length > 0 ? (
          <div className="space-y-2">
            {appointmentsQuery.data.map((appointment) => (
              <div key={appointment.id} className="rounded-md border p-3 text-sm">
                <p className="font-semibold text-slate-800">{appointment.patient_name ?? "Paciente"}</p>
                <p className="text-slate-600">
                  Dentista: {appointment.dentist_name ?? "-"} | {new Date(appointment.start_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} - {new Date(appointment.end_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Nenhuma consulta para hoje.</p>
        )}
      </Card>
    </div>
  );
}
