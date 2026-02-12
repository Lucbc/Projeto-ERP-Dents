import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { fromInputDateTime, toInputDateTime } from "@/lib/datetime";
import { getApiErrorMessage } from "@/lib/api";
import { appointmentService, dentistService, patientService } from "@/lib/services";
import type { Appointment, AppointmentStatus } from "@/types";

const appointmentSchema = z
  .object({
    patient_id: z.string().uuid("Selecione um paciente."),
    dentist_id: z.string().uuid("Selecione um dentista."),
    start_at: z.string().min(1, "Data/hora inicial é obrigatória."),
    end_at: z.string().min(1, "Data/hora final é obrigatória."),
    status: z.enum(["scheduled", "confirmed", "completed", "cancelled"]),
    notes: z.string().optional(),
  })
  .refine((value) => new Date(value.end_at) > new Date(value.start_at), {
    message: "Horário final deve ser maior que o inicial.",
    path: ["end_at"],
  });

type AppointmentForm = z.infer<typeof appointmentSchema>;

const statusLabel: Record<AppointmentStatus, string> = {
  scheduled: "Agendada",
  confirmed: "Confirmada",
  completed: "Concluída",
  cancelled: "Cancelada",
};

export function AppointmentsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [dentistFilter, setDentistFilter] = useState("");
  const [patientFilter, setPatientFilter] = useState("");

  const [openModal, setOpenModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);

  const form = useForm<AppointmentForm>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      patient_id: "",
      dentist_id: "",
      start_at: "",
      end_at: "",
      status: "scheduled",
      notes: "",
    },
  });

  const patientsQuery = useQuery({
    queryKey: ["patients", "appointments-form"],
    queryFn: () => patientService.list({ limit: 300, offset: 0 }),
  });

  const dentistsQuery = useQuery({
    queryKey: ["dentists", "appointments-form"],
    queryFn: () => dentistService.list({ limit: 300, offset: 0 }),
  });

  const appointmentsQuery = useQuery({
    queryKey: ["appointments", fromDate, toDate, dentistFilter, patientFilter],
    queryFn: () =>
      appointmentService.list({
        from: fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : undefined,
        to: toDate ? new Date(`${toDate}T23:59:59`).toISOString() : undefined,
        dentist_id: dentistFilter || undefined,
        patient_id: patientFilter || undefined,
      }),
  });

  const createMutation = useMutation({
    mutationFn: (payload: AppointmentForm) =>
      appointmentService.create({
        patient_id: payload.patient_id,
        dentist_id: payload.dentist_id,
        start_at: fromInputDateTime(payload.start_at),
        end_at: fromInputDateTime(payload.end_at),
        status: payload.status,
        notes: payload.notes?.trim() ? payload.notes.trim() : null,
      }),
    onSuccess: () => {
      toast("Consulta cadastrada com sucesso.");
      setOpenModal(false);
      form.reset();
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AppointmentForm }) =>
      appointmentService.update(id, {
        patient_id: payload.patient_id,
        dentist_id: payload.dentist_id,
        start_at: fromInputDateTime(payload.start_at),
        end_at: fromInputDateTime(payload.end_at),
        status: payload.status,
        notes: payload.notes?.trim() ? payload.notes.trim() : null,
      }),
    onSuccess: () => {
      toast("Consulta atualizada com sucesso.");
      setOpenModal(false);
      setEditingAppointment(null);
      form.reset();
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => appointmentService.remove(id),
    onSuccess: () => {
      toast("Consulta removida.");
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const items = useMemo(() => appointmentsQuery.data ?? [], [appointmentsQuery.data]);
  const patients = useMemo(() => patientsQuery.data?.items ?? [], [patientsQuery.data]);
  const dentists = useMemo(() => dentistsQuery.data?.items ?? [], [dentistsQuery.data]);

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const onNew = () => {
    const start = new Date();
    const end = new Date(start.getTime() + 30 * 60 * 1000);

    setEditingAppointment(null);
    form.reset({
      patient_id: "",
      dentist_id: "",
      start_at: toInputDateTime(start.toISOString()),
      end_at: toInputDateTime(end.toISOString()),
      status: "scheduled",
      notes: "",
    });
    setOpenModal(true);
  };

  const onEdit = (appointment: Appointment) => {
    setEditingAppointment(appointment);
    form.reset({
      patient_id: appointment.patient_id,
      dentist_id: appointment.dentist_id,
      start_at: toInputDateTime(appointment.start_at),
      end_at: toInputDateTime(appointment.end_at),
      status: appointment.status,
      notes: appointment.notes ?? "",
    });
    setOpenModal(true);
  };

  const onSubmit = (values: AppointmentForm) => {
    if (editingAppointment) {
      updateMutation.mutate({ id: editingAppointment.id, payload: values });
      return;
    }
    createMutation.mutate(values);
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />

          <Select value={dentistFilter} onChange={(event) => setDentistFilter(event.target.value)}>
            <option value="">Todos dentistas</option>
            {dentists.map((dentist) => (
              <option key={dentist.id} value={dentist.id}>
                {dentist.full_name}
              </option>
            ))}
          </Select>

          <Select value={patientFilter} onChange={(event) => setPatientFilter(event.target.value)}>
            <option value="">Todos pacientes</option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.full_name}
              </option>
            ))}
          </Select>

          <Button onClick={onNew}>Nova</Button>
        </div>
      </Card>

      {appointmentsQuery.isLoading && <LoadingState message="Carregando consultas..." />}
      {appointmentsQuery.isError && <ErrorState message="Erro ao carregar consultas." />}

      {!appointmentsQuery.isLoading && !appointmentsQuery.isError && (
        <Card>
          {items.length === 0 ? (
            <EmptyState message="Nenhuma consulta encontrada para o filtro informado." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 font-semibold">Paciente</th>
                    <th className="p-2 font-semibold">Dentista</th>
                    <th className="p-2 font-semibold">Início</th>
                    <th className="p-2 font-semibold">Fim</th>
                    <th className="p-2 font-semibold">Status</th>
                    <th className="p-2 font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((appointment) => (
                    <tr key={appointment.id} className="border-b last:border-b-0">
                      <td className="p-2 font-medium text-slate-800">{appointment.patient_name ?? "-"}</td>
                      <td className="p-2">{appointment.dentist_name ?? "-"}</td>
                      <td className="p-2">{new Date(appointment.start_at).toLocaleString("pt-BR")}</td>
                      <td className="p-2">{new Date(appointment.end_at).toLocaleString("pt-BR")}</td>
                      <td className="p-2">{statusLabel[appointment.status]}</td>
                      <td className="p-2">
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={() => onEdit(appointment)}>
                            Editar
                          </Button>
                          <Button
                            variant="danger"
                            onClick={() => {
                              if (window.confirm("Deseja remover esta consulta?")) {
                                deleteMutation.mutate(appointment.id);
                              }
                            }}
                          >
                            Excluir
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <Modal
        open={openModal}
        onClose={() => setOpenModal(false)}
        title={editingAppointment ? "Editar consulta" : "Nova consulta"}
      >
        <form className="grid gap-3 md:grid-cols-2" onSubmit={form.handleSubmit(onSubmit)}>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Paciente *</label>
            <Select {...form.register("patient_id")}>
              <option value="">Selecione</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.full_name}
                </option>
              ))}
            </Select>
            {form.formState.errors.patient_id && (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.patient_id.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Dentista *</label>
            <Select {...form.register("dentist_id")}>
              <option value="">Selecione</option>
              {dentists.map((dentist) => (
                <option key={dentist.id} value={dentist.id}>
                  {dentist.full_name}
                </option>
              ))}
            </Select>
            {form.formState.errors.dentist_id && (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.dentist_id.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Início *</label>
            <Input type="datetime-local" {...form.register("start_at")} />
            {form.formState.errors.start_at && (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.start_at.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Fim *</label>
            <Input type="datetime-local" {...form.register("end_at")} />
            {form.formState.errors.end_at && (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.end_at.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Status</label>
            <Select {...form.register("status")}>
              <option value="scheduled">scheduled</option>
              <option value="confirmed">confirmed</option>
              <option value="completed">completed</option>
              <option value="cancelled">cancelled</option>
            </Select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-semibold text-slate-700">Notas</label>
            <Textarea {...form.register("notes")} />
          </div>

          <div className="md:col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpenModal(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
