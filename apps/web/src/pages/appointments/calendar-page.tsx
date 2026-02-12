import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addMonths,
  endOfDay,
  format,
  getDay,
  parse,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Calendar, type Event, type View, Views, dateFnsLocalizer } from "react-big-calendar";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { fromInputDateTime, toInputDateTime } from "@/lib/datetime";
import { getApiErrorMessage } from "@/lib/api";
import { appointmentService, dentistService, patientService } from "@/lib/services";
import type { Appointment } from "@/types";

const locales = { "pt-BR": ptBR };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales,
});

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

type CalendarEvent = Event & {
  resource: Appointment;
};

export function CalendarPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState<View>(Views.WEEK);
  const [openModal, setOpenModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);

  const rangeFrom = startOfDay(addMonths(currentDate, -2)).toISOString();
  const rangeTo = endOfDay(addMonths(currentDate, 2)).toISOString();

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
    queryKey: ["patients", "calendar-form"],
    queryFn: () => patientService.list({ limit: 300, offset: 0 }),
  });

  const dentistsQuery = useQuery({
    queryKey: ["dentists", "calendar-form"],
    queryFn: () => dentistService.list({ limit: 300, offset: 0 }),
  });

  const appointmentsQuery = useQuery({
    queryKey: ["appointments", "calendar", rangeFrom, rangeTo],
    queryFn: () => appointmentService.list({ from: rangeFrom, to: rangeTo }),
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
      setOpenModal(false);
      setEditingAppointment(null);
      form.reset();
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const patients = patientsQuery.data?.items ?? [];
  const dentists = dentistsQuery.data?.items ?? [];

  const events = useMemo<CalendarEvent[]>(
    () =>
      (appointmentsQuery.data ?? []).map((appointment) => ({
        title: `${appointment.patient_name ?? "Paciente"} - ${appointment.dentist_name ?? "Dentista"}`,
        start: new Date(appointment.start_at),
        end: new Date(appointment.end_at),
        resource: appointment,
      })),
    [appointmentsQuery.data],
  );

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const openCreateModal = () => {
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

  const openEditModal = (appointment: Appointment) => {
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
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-slate-600">
            Agenda em calendário com visualizações por dia, semana e mês.
          </p>
          <Button onClick={openCreateModal}>Nova consulta</Button>
        </div>
      </Card>

      <Card>
        <div className="h-[720px]">
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            culture="pt-BR"
            views={[Views.DAY, Views.WEEK, Views.MONTH]}
            view={currentView}
            onView={(view) => setCurrentView(view)}
            date={currentDate}
            onNavigate={(date) => setCurrentDate(date)}
            onSelectEvent={(event) => openEditModal((event as CalendarEvent).resource)}
            selectable
            onSelectSlot={(slot) => {
              setEditingAppointment(null);
              form.reset({
                patient_id: "",
                dentist_id: "",
                start_at: toInputDateTime(slot.start.toISOString()),
                end_at: toInputDateTime(slot.end.toISOString()),
                status: "scheduled",
                notes: "",
              });
              setOpenModal(true);
            }}
            eventPropGetter={(event) => {
              const status = (event as CalendarEvent).resource.status;
              const background =
                status === "cancelled"
                  ? "#e11d48"
                  : status === "completed"
                    ? "#0f766e"
                    : status === "confirmed"
                      ? "#0284c7"
                      : "#0ea5a5";
              return {
                style: {
                  backgroundColor: background,
                  borderRadius: 8,
                  border: "none",
                  color: "white",
                  padding: 2,
                },
              };
            }}
          />
        </div>
      </Card>

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

          <div className="md:col-span-2 mt-2 flex justify-between gap-2">
            <div>
              {editingAppointment && (
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => {
                    if (window.confirm("Deseja remover esta consulta?")) {
                      deleteMutation.mutate(editingAppointment.id);
                    }
                  }}
                >
                  Excluir
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpenModal(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}

