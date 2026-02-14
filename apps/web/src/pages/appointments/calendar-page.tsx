import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfDay,
  endOfWeek,
  format,
  getDay,
  parse,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useEffect, useMemo, useState } from "react";
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
import { usePermissions } from "@/hooks/use-permissions";
import { getApiErrorMessage } from "@/lib/api";
import { appointmentStatusOptions } from "@/lib/labels";
import { appointmentService, dentistService, patientService, procedureService } from "@/lib/services";
import type { Appointment, Procedure } from "@/types";

const locales = { "pt-BR": ptBR };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales,
});

const calendarMessages = {
  date: "Data",
  time: "Hora",
  event: "Evento",
  allDay: "Dia inteiro",
  week: "Semana",
  work_week: "Semana util",
  day: "Dia",
  month: "Mes",
  previous: "Anterior",
  next: "Proximo",
  yesterday: "Ontem",
  tomorrow: "Amanha",
  today: "Hoje",
  agenda: "Agenda",
  noEventsInRange: "Nenhuma consulta neste periodo.",
  showMore: (total: number) => `+${total} mais`,
};

const dentistFallbackPalette = [
  "#0EA5A5",
  "#2563EB",
  "#EA580C",
  "#16A34A",
  "#D97706",
  "#DB2777",
  "#7C3AED",
  "#0891B2",
];

const appointmentSchema = z
  .object({
    patient_id: z.string().uuid("Selecione um paciente."),
    dentist_id: z.string().uuid("Selecione um dentista."),
    procedure_ids: z.array(z.string().uuid()).default([]),
    start_at: z.string().min(1, "Data/hora inicial e obrigatoria."),
    end_at: z.string().min(1, "Data/hora final e obrigatoria."),
    status: z.enum(["scheduled", "confirmed", "completed", "cancelled"]),
    notes: z.string().optional(),
  })
  .refine((value) => new Date(value.end_at) > new Date(value.start_at), {
    message: "Horario final deve ser maior que o inicial.",
    path: ["end_at"],
  });

type AppointmentForm = z.infer<typeof appointmentSchema>;

type CalendarEvent = Omit<Event, "start" | "end"> & {
  start: Date;
  end: Date;
  color: string;
  resource: Appointment;
};

function normalizeHexColor(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(normalized)) return null;
  return normalized;
}

function fallbackDentistColor(dentistId: string): string {
  let hash = 0;
  for (let i = 0; i < dentistId.length; i += 1) {
    hash = (hash * 31 + dentistId.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % dentistFallbackPalette.length;
  return dentistFallbackPalette[idx];
}

function clampColor(value: number): number {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return value;
}

function shiftHexColor(hex: string, amount: number): string {
  const clean = hex.replace("#", "");
  const r = clampColor(parseInt(clean.slice(0, 2), 16) + amount);
  const g = clampColor(parseInt(clean.slice(2, 4), 16) + amount);
  const b = clampColor(parseInt(clean.slice(4, 6), 16) + amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b
    .toString(16)
    .padStart(2, "0")}`.toUpperCase();
}

function resolveOverlapColors(events: CalendarEvent[]): Map<string, string> {
  const byAppointment = new Map<string, string>();

  for (const event of events) {
    const overlapWithSameBaseColor = events
      .filter(
        (other) =>
          other.color === event.color && other.start < event.end && other.end > event.start,
      )
      .sort((a, b) => {
        const startDiff = a.start.getTime() - b.start.getTime();
        if (startDiff !== 0) return startDiff;

        const endDiff = a.end.getTime() - b.end.getTime();
        if (endDiff !== 0) return endDiff;

        return a.resource.id.localeCompare(b.resource.id);
      });

    if (overlapWithSameBaseColor.length <= 1) {
      byAppointment.set(event.resource.id, event.color);
      continue;
    }

    const index = overlapWithSameBaseColor.findIndex((item) => item.resource.id === event.resource.id);
    const center = (overlapWithSameBaseColor.length - 1) / 2;
    const shift = Math.round((index - center) * 24);
    byAppointment.set(event.resource.id, shiftHexColor(event.color, shift));
  }

  return byAppointment;
}

function calculateSuggestedDuration(
  selectedProcedureIds: string[],
  procedureById: Map<string, Procedure>,
): number {
  return selectedProcedureIds.reduce((total, procedureId) => {
    const duration = procedureById.get(procedureId)?.duration_minutes ?? 0;
    return total + duration;
  }, 0);
}

function toSuggestedEndAt(startAtInput: string, durationMinutes: number): string | null {
  if (!startAtInput || durationMinutes <= 0) return null;

  const startDate = new Date(startAtInput);
  if (Number.isNaN(startDate.getTime())) return null;

  const suggestedEndAt = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
  return toInputDateTime(suggestedEndAt.toISOString());
}

function formatPeriodLabel(currentDate: Date, currentView: View): string {
  if (currentView === Views.DAY) {
    return format(currentDate, "EEEE, dd/MM/yyyy", { locale: ptBR });
  }

  if (currentView === Views.WEEK) {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const end = endOfWeek(currentDate, { weekStartsOn: 1 });
    return `${format(start, "dd/MM/yyyy")} - ${format(end, "dd/MM/yyyy")}`;
  }

  return format(currentDate, "MMMM 'de' yyyy", { locale: ptBR });
}

function moveDateByView(currentDate: Date, currentView: View, direction: -1 | 1): Date {
  if (currentView === Views.DAY) {
    return addDays(currentDate, direction);
  }

  if (currentView === Views.WEEK) {
    return addWeeks(currentDate, direction);
  }

  return addMonths(currentDate, direction);
}

function getStatusBorderColor(status: Appointment["status"]): string {
  if (status === "cancelled") return "#BE123C";
  if (status === "completed") return "#0F766E";
  if (status === "confirmed") return "#1D4ED8";
  return "#0F766E";
}

export function CalendarPage() {
  const { toast } = useToast();
  const { can } = usePermissions();
  const queryClient = useQueryClient();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState<View>(Views.WEEK);
  const [openModal, setOpenModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [manualEndOverride, setManualEndOverride] = useState(false);

  const rangeFrom = startOfDay(addMonths(currentDate, -2)).toISOString();
  const rangeTo = endOfDay(addMonths(currentDate, 2)).toISOString();

  const form = useForm<AppointmentForm>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      patient_id: "",
      dentist_id: "",
      procedure_ids: [],
      start_at: "",
      end_at: "",
      status: "scheduled",
      notes: "",
    },
  });

  const patientsQuery = useQuery({
    queryKey: ["patients", "calendar-form"],
    queryFn: () => patientService.listAll(),
  });

  const dentistsQuery = useQuery({
    queryKey: ["dentists", "calendar-form"],
    queryFn: () => dentistService.listAll(),
  });

  const proceduresQuery = useQuery({
    queryKey: ["procedures", "calendar-form"],
    queryFn: () => procedureService.listAll(),
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
        procedure_ids: payload.procedure_ids,
        start_at: fromInputDateTime(payload.start_at),
        end_at: fromInputDateTime(payload.end_at),
        status: payload.status,
        notes: payload.notes?.trim() ? payload.notes.trim() : null,
      }),
    onSuccess: () => {
      toast("Consulta cadastrada com sucesso.");
      setOpenModal(false);
      form.reset();
      setManualEndOverride(false);
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AppointmentForm }) =>
      appointmentService.update(id, {
        patient_id: payload.patient_id,
        dentist_id: payload.dentist_id,
        procedure_ids: payload.procedure_ids,
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
      setManualEndOverride(false);
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
      setManualEndOverride(false);
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const patients = patientsQuery.data?.items ?? [];
  const dentists = dentistsQuery.data?.items ?? [];
  const procedures = proceduresQuery.data?.items ?? [];
  const procedureById = useMemo(
    () => new Map(procedures.map((procedure) => [procedure.id, procedure])),
    [procedures],
  );
  const dentistColorById = useMemo(() => {
    const result = new Map<string, string>();
    for (const dentist of dentists) {
      result.set(
        dentist.id,
        normalizeHexColor(dentist.color) ?? fallbackDentistColor(dentist.id),
      );
    }
    return result;
  }, [dentists]);
  const selectedProcedureIds = form.watch("procedure_ids") ?? [];
  const startAtValue = form.watch("start_at");
  const suggestedDurationMinutes = useMemo(
    () => calculateSuggestedDuration(selectedProcedureIds, procedureById),
    [procedureById, selectedProcedureIds],
  );
  const canCreate = can("appointments", "create");
  const canUpdate = can("appointments", "update");
  const canDelete = can("appointments", "delete");

  const baseEvents = useMemo<CalendarEvent[]>(
    () =>
      (appointmentsQuery.data ?? []).map((appointment) => ({
        title: `${appointment.patient_name ?? "Paciente"} - ${appointment.dentist_name ?? "Dentista"}`,
        start: new Date(appointment.start_at),
        end: new Date(appointment.end_at),
        color:
          dentistColorById.get(appointment.dentist_id) ?? fallbackDentistColor(appointment.dentist_id),
        resource: appointment,
      })),
    [appointmentsQuery.data, dentistColorById],
  );

  const overlapColorByAppointmentId = useMemo(
    () => resolveOverlapColors(baseEvents),
    [baseEvents],
  );

  const events = useMemo<CalendarEvent[]>(
    () =>
      baseEvents.map((event) => ({
        ...event,
        color: overlapColorByAppointmentId.get(event.resource.id) ?? event.color,
      })),
    [baseEvents, overlapColorByAppointmentId],
  );

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const periodLabel = useMemo(
    () => formatPeriodLabel(currentDate, currentView),
    [currentDate, currentView],
  );

  useEffect(() => {
    if (manualEndOverride) return;

    const suggestedEndAt = toSuggestedEndAt(startAtValue, suggestedDurationMinutes);
    if (!suggestedEndAt) return;

    form.setValue("end_at", suggestedEndAt, { shouldDirty: true, shouldValidate: true });
  }, [form, manualEndOverride, startAtValue, suggestedDurationMinutes]);

  const toggleProcedure = (procedureId: string) => {
    const current = form.getValues("procedure_ids") ?? [];
    const next = current.includes(procedureId)
      ? current.filter((item) => item !== procedureId)
      : [...current, procedureId];

    form.setValue("procedure_ids", next, { shouldDirty: true, shouldValidate: false });
  };

  const applySuggestedDuration = () => {
    const suggestedEndAt = toSuggestedEndAt(form.getValues("start_at"), suggestedDurationMinutes);
    if (!suggestedEndAt) return;

    setManualEndOverride(false);
    form.setValue("end_at", suggestedEndAt, { shouldDirty: true, shouldValidate: true });
  };

  const openCreateModal = () => {
    const start = new Date();
    const end = new Date(start.getTime() + 30 * 60 * 1000);

    setEditingAppointment(null);
    setManualEndOverride(false);
    form.reset({
      patient_id: "",
      dentist_id: "",
      procedure_ids: [],
      start_at: toInputDateTime(start.toISOString()),
      end_at: toInputDateTime(end.toISOString()),
      status: "scheduled",
      notes: "",
    });
    setOpenModal(true);
  };

  const openEditModal = (appointment: Appointment) => {
    setEditingAppointment(appointment);
    setManualEndOverride(true);
    form.reset({
      patient_id: appointment.patient_id,
      dentist_id: appointment.dentist_id,
      procedure_ids: appointment.procedure_ids ?? [],
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

  const goPrev = () => setCurrentDate((prev) => moveDateByView(prev, currentView, -1));
  const goNext = () => setCurrentDate((prev) => moveDateByView(prev, currentView, 1));
  const goToday = () => setCurrentDate(new Date());

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm text-slate-600">
              Agenda em calendario com visualizacoes por dia, semana e mes.
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-800">{periodLabel}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={goPrev}>
              Anterior
            </Button>
            <Button type="button" variant="outline" onClick={goToday}>
              Hoje
            </Button>
            <Button type="button" variant="outline" onClick={goNext}>
              Proximo
            </Button>
            <Select
              searchable={false}
              value={currentView}
              onChange={(event) => setCurrentView(event.target.value as View)}
              className="w-36"
            >
              <option value={Views.DAY}>Dia</option>
              <option value={Views.WEEK}>Semana</option>
              <option value={Views.MONTH}>Mes</option>
            </Select>
            {canCreate && <Button onClick={openCreateModal}>Nova consulta</Button>}
          </div>
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
            messages={calendarMessages}
            views={[Views.DAY, Views.WEEK, Views.MONTH]}
            toolbar={false}
            view={currentView}
            onView={(view) => setCurrentView(view)}
            date={currentDate}
            onNavigate={(date) => setCurrentDate(date)}
            onSelectEvent={(event) => {
              if (!canUpdate) return;
              openEditModal((event as CalendarEvent).resource);
            }}
            selectable={canCreate}
            onSelectSlot={(slot) => {
              if (!canCreate) return;
              setEditingAppointment(null);
              setManualEndOverride(false);
              form.reset({
                patient_id: "",
                dentist_id: "",
                procedure_ids: [],
                start_at: toInputDateTime(slot.start.toISOString()),
                end_at: toInputDateTime(slot.end.toISOString()),
                status: "scheduled",
                notes: "",
              });
              setOpenModal(true);
            }}
            eventPropGetter={(event) => {
              const currentEvent = event as CalendarEvent;
              const status = currentEvent.resource.status;
              const background = currentEvent.color;
              return {
                style: {
                  backgroundColor: background,
                  borderLeft: `4px solid ${getStatusBorderColor(status)}`,
                  borderRadius: 8,
                  border: "none",
                  color: "white",
                  padding: 2,
                  opacity: status === "cancelled" ? 0.55 : 1,
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

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-semibold text-slate-700">Procedimentos</label>
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-slate-200 p-2">
              {procedures.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum procedimento cadastrado.</p>
              ) : (
                procedures.map((procedure) => {
                  const checked = selectedProcedureIds.includes(procedure.id);
                  return (
                    <label
                      key={procedure.id}
                      className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleProcedure(procedure.id)}
                        className="mt-1 h-4 w-4"
                      />
                      <span className="flex-1 text-sm text-slate-700">
                        {procedure.name}
                        {procedure.duration_minutes ? (
                          <span className="ml-2 text-xs text-slate-500">
                            ({procedure.duration_minutes} min)
                          </span>
                        ) : (
                          <span className="ml-2 text-xs text-slate-500">(sem duracao)</span>
                        )}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {suggestedDurationMinutes > 0
                ? `Duracao sugerida: ${suggestedDurationMinutes} min`
                : "Selecione procedimentos para sugerir a duracao."}
            </p>
            {manualEndOverride && suggestedDurationMinutes > 0 && (
              <Button
                type="button"
                variant="outline"
                className="mt-2 px-3 py-1 text-xs"
                onClick={applySuggestedDuration}
              >
                Aplicar duracao sugerida
              </Button>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Inicio *</label>
            <Input type="datetime-local" {...form.register("start_at")} />
            {form.formState.errors.start_at && (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.start_at.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Fim *</label>
            <Input
              type="datetime-local"
              {...form.register("end_at", {
                onChange: () => setManualEndOverride(true),
              })}
            />
            {form.formState.errors.end_at && (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.end_at.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Status</label>
            <Select {...form.register("status")}>
              {appointmentStatusOptions.map((statusOption) => (
                <option key={statusOption.value} value={statusOption.value}>
                  {statusOption.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-semibold text-slate-700">Notas</label>
            <Textarea {...form.register("notes")} />
          </div>

          <div className="md:col-span-2 mt-2 flex justify-between gap-2">
            <div>
              {editingAppointment && canDelete && (
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
