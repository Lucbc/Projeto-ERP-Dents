import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { useAuth } from "@/hooks/use-auth";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { appointmentStatusLabels } from "@/lib/labels";
import { consultationService } from "@/lib/services";

export function ConsultationPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  const dentistId =
    user && user.role !== "dentist" && user.dentist_id ? user.dentist_id : undefined;

  const nextQuery = useQuery({
    queryKey: ["consultations", "next", dentistId],
    queryFn: () => consultationService.next(dentistId),
  });

  const patientsQuery = useQuery({
    queryKey: ["consultations", "patients", search, dentistId],
    queryFn: () =>
      consultationService.listPatients({
        search,
        limit: 100,
        offset: 0,
        dentist_id: dentistId,
      }),
  });

  const detailQuery = useQuery({
    queryKey: ["consultations", "patient-detail", selectedPatientId, dentistId],
    queryFn: () => consultationService.getPatientDetail(selectedPatientId!, dentistId),
    enabled: Boolean(selectedPatientId),
  });

  const patients = useMemo(() => patientsQuery.data?.items ?? [], [patientsQuery.data]);

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-display text-xl font-semibold text-slate-800">Consulta</h2>
        <p className="text-sm text-slate-500">
          Visualize a próxima consulta e acesse rapidamente os dados do paciente.
        </p>
      </Card>

      <Card>
        <h3 className="mb-2 font-semibold text-slate-800">Próxima consulta</h3>
        {nextQuery.isLoading && <LoadingState message="Carregando próxima consulta..." />}
        {nextQuery.isError && <ErrorState message="Erro ao carregar a próxima consulta." />}
        {!nextQuery.isLoading && !nextQuery.isError && !nextQuery.data && (
          <EmptyState message="Não há próxima consulta agendada." />
        )}
        {!nextQuery.isLoading && !nextQuery.isError && nextQuery.data && (
          <div className="rounded-md border p-3 text-sm">
            <p className="font-semibold text-slate-800">{nextQuery.data.patient_name ?? "Paciente"}</p>
            <p className="text-slate-600">Dentista: {nextQuery.data.dentist_name ?? "-"}</p>
            <p className="text-slate-600">
              Início: {formatDateTime(nextQuery.data.start_at)} | Fim: {formatDateTime(nextQuery.data.end_at)}
            </p>
            <p className="text-slate-600">Status: {appointmentStatusLabels[nextQuery.data.status]}</p>
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h3 className="font-semibold text-slate-800">Pacientes</h3>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, CPF ou e-mail"
            className="md:w-80"
          />
        </div>

        {patientsQuery.isLoading && <LoadingState message="Carregando pacientes..." />}
        {patientsQuery.isError && <ErrorState message="Erro ao carregar pacientes." />}

        {!patientsQuery.isLoading && !patientsQuery.isError && patients.length === 0 && (
          <EmptyState message="Nenhum paciente encontrado." />
        )}

        {!patientsQuery.isLoading && !patientsQuery.isError && patients.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2 font-semibold">Paciente</th>
                  <th className="p-2 font-semibold">Contato</th>
                  <th className="p-2 font-semibold">Próxima consulta</th>
                  <th className="p-2 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((item) => (
                  <tr key={item.patient.id} className="border-b last:border-b-0">
                    <td className="p-2 font-medium text-slate-800">{item.patient.full_name}</td>
                    <td className="p-2">{item.patient.phone ?? item.patient.email ?? "-"}</td>
                    <td className="p-2">
                      {item.next_appointment
                        ? formatDateTime(item.next_appointment.start_at)
                        : "Sem consulta futura"}
                    </td>
                    <td className="p-2">
                      <Button variant="outline" onClick={() => setSelectedPatientId(item.patient.id)}>
                        Abrir
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selectedPatientId && (
        <Card>
          <h3 className="mb-3 font-semibold text-slate-800">Dados do paciente</h3>
          {detailQuery.isLoading && <LoadingState message="Carregando dados do paciente..." />}
          {detailQuery.isError && <ErrorState message="Erro ao carregar dados do paciente." />}

          {!detailQuery.isLoading && !detailQuery.isError && detailQuery.data && (
            <div className="space-y-4">
              <div className="rounded-md border p-3 text-sm">
                <p className="font-semibold text-slate-800">{detailQuery.data.patient.full_name}</p>
                <p className="text-slate-600">Nascimento: {formatDate(detailQuery.data.patient.birth_date)}</p>
                <p className="text-slate-600">CPF: {detailQuery.data.patient.cpf ?? "-"}</p>
                <p className="text-slate-600">Telefone: {detailQuery.data.patient.phone ?? "-"}</p>
                <p className="text-slate-600">E-mail: {detailQuery.data.patient.email ?? "-"}</p>
                <p className="text-slate-600">Endereço: {detailQuery.data.patient.address ?? "-"}</p>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold text-slate-700">Próxima consulta deste paciente</p>
                {detailQuery.data.next_appointment ? (
                  <div className="rounded-md border p-3 text-sm">
                    <p className="text-slate-700">
                      {formatDateTime(detailQuery.data.next_appointment.start_at)} até{" "}
                      {formatDateTime(detailQuery.data.next_appointment.end_at)}
                    </p>
                    <p className="text-slate-600">
                      Status: {appointmentStatusLabels[detailQuery.data.next_appointment.status]}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Sem próxima consulta agendada para este paciente.</p>
                )}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
