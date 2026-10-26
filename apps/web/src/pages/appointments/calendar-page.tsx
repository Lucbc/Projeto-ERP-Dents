import { clinicalDate, clinicCalendarLocalizer, clinicMonthWindow, clinicSelection } from "@/lib/clinic-calendar";
import { clinicIntervalIsPositive, clinicTimeError, resolveClinicInput, suggestedClinicEnd } from "@/lib/clinic-time";
import { AvailabilityReview, useAvailabilityReview } from "@/hooks/use-availability-review";
import { zodResolver } from "@hookform/resolvers/zod";
import { isAxiosError } from "axios";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "@/hooks/use-live-query";
import { LiveQueryStatus } from "@/components/ui/live-query-status";
import { useForm } from "react-hook-form";
import { Calendar, type Event, type View, Views } from "react-big-calendar";
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
import { appointmentDeletionConfirmation, appointmentDeletionError } from "@/lib/appointment-deletion";
import { getApiErrorMessage } from "@/lib/api";
import { appointmentStatusOptions } from "@/lib/labels";
import { appointmentService, dentistService } from "@/lib/services";
import { useAppointmentReferences } from "./use-appointment-references";
import { useActionOptions } from "@/hooks/use-action-options";
import type { Appointment, Procedure } from "@/types";



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



function formatPeriodLabel(currentDate: Date, currentView: View): string {
  const date = clinicalDate(currentDate);
  if (currentView === Views.DAY) return date.toFormat("cccc, dd/MM/yyyy");
  if (currentView === Views.WEEK) return `${date.startOf("week").toFormat("dd/MM/yyyy")} - ${date.endOf("week").toFormat("dd/MM/yyyy")}`;
  return date.toFormat("MMMM 'de' yyyy");
}

function moveDateByView(currentDate: Date, currentView: View, direction: -1 | 1): Date {
  const unit = currentView === Views.DAY ? "days" : currentView === Views.WEEK ? "weeks" : "months";
  return clinicalDate(currentDate).plus({ [unit]: direction }).toJSDate();
}

function getStatusBorderColor(status: Appointment["status"]): string {
  if (status === "cancelled") return "#BE123C";
  if (status === "completed") return "#0F766E";
  if (status === "confirmed") return "#1D4ED8";
  return "#0F766E";
}

const readGridDentists = (signal: AbortSignal) => dentistService.listAll({}, signal);

export function CalendarPage() {
  const { toast } = useToast();
  const { can } = usePermissions();
  const queryClient = useQueryClient();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState<View>(Views.WEEK);
  const [openModal, setOpenModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [editConflict, setEditConflict] = useState(false);
  const [deleteReviews, setDeleteReviews] = useState<Record<string, string>>({});
  const deleteReview = editingAppointment ? deleteReviews[editingAppointment.id] ?? null : null;
  const [manualEndOverride, setManualEndOverride] = useState(false);
  const [referenceAction, setReferenceAction] = useState(0);
  const references = useAppointmentReferences(openModal ? referenceAction : null);
  const gridDentists = useActionOptions(0, can("dentists", "view"), readGridDentists);
  const mounted = useRef(false);
  const pendingReload = useRef<AbortController>();
  const actionScope = useRef({ openModal, referenceAction });
  actionScope.current = { openModal, referenceAction };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => () => { pendingReload.current?.abort(); pendingReload.current = undefined; }, [openModal, referenceAction]);
  // A denied form read must also remove the page's previously authorized copy.
  useEffect(() => { if (references.dentists.status === "denied") gridDentists.deny(); }, [references.dentists.status, gridDentists.deny]);



  const { from: rangeFrom, to: rangeTo } = clinicMonthWindow(currentDate, 2);

  const form = useForm<z.input<typeof appointmentSchema>, unknown, AppointmentForm>({
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

  const appointmentsQuery = useLiveQuery(
    ["appointments", "calendar", rangeFrom, rangeTo],
    (signal) => appointmentService.list({ from: rangeFrom, to: rangeTo }, signal),
  );
  useEffect(() => {
    if (appointmentsQuery.accessDenied) {
      setOpenModal(false); setEditingAppointment(null); form.reset();
    }
  }, [appointmentsQuery.accessDenied, form]);

  const availabilityReview = useAvailabilityReview(async () => {
    if (!await references.dentists.reload()) throw new Error("Não foi possível atualizar a disponibilidade. Tente novamente.");
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
    onError: (error) => {
      if (!availabilityReview.handle(error)) toast(getApiErrorMessage(error), "error");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ appointment, payload }: { appointment: Appointment; payload: AppointmentForm }) =>
      appointmentService.update(appointment.id, {
        version: appointment.version,
        patient_id: payload.patient_id,
        dentist_id: payload.dentist_id,
        procedure_ids: payload.procedure_ids,
        start_at: fromInputDateTime(payload.start_at, appointment.start_at),
        end_at: fromInputDateTime(payload.end_at, appointment.end_at),
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
    onError: (error) => {
      if (availabilityReview.handle(error)) return;
      if (isAxiosError(error) && error.response?.status === 409) setEditConflict(true);
      toast(getApiErrorMessage(error), "error");
    },
  });

  const reloadAppointmentMutation = useMutation({
    mutationFn: ({ id }: { id: string; action: number }) => {
      pendingReload.current?.abort(); pendingReload.current = new AbortController();
      return appointmentService.get(id, pendingReload.current.signal);
    },
    onSuccess: (appointment, request) => {
      if (!mounted.current || !actionScope.current.openModal || actionScope.current.referenceAction !== request.action) return;
      setDeleteReviews((reviews) => {
        const next = { ...reviews };
        delete next[appointment.id];
        return next;
      });
      openEditModal(appointment, true);
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (error, request) => {
      if (!mounted.current || !actionScope.current.openModal || actionScope.current.referenceAction !== request.action) return;
      toast(getApiErrorMessage(error), "error");
      if (deleteReview) setDeleteReviews((reviews) => ({ ...reviews, [request.id]: appointmentDeletionError(error) }));
    },
  });

  const deleteMutation = useMutation({
    retry: false,
    mutationFn: (target: { id: string; version: number }) => appointmentService.remove(target.id, target.version),
    onSuccess: () => {
      toast("Consulta removida.");
      setOpenModal(false);
      setEditingAppointment(null);
      form.reset();
      setManualEndOverride(false);
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
      void queryClient.invalidateQueries({ queryKey: ["financial"] });
    },
    onError: (error, target) => setDeleteReviews((reviews) => ({ ...reviews, [target.id]: appointmentDeletionError(error) })),
  });

  const patients = references.patients.items;
  const dentists = references.dentists.items;
  const procedures = references.procedures.items;
  const procedureById = useMemo(
    () => new Map(procedures.map((procedure) => [procedure.id, procedure])),
    [procedures],
  );
  const dentistColorById = useMemo(() => {
    const result = new Map<string, string>();
    for (const dentist of gridDentists.items) {
      result.set(
        dentist.id,
        normalizeHexColor(dentist.color) ?? fallbackDentistColor(dentist.id),
      );
    }
    return result;
  }, [gridDentists.items]);
  const selectedProcedureIds = form.watch("procedure_ids") ?? [];
  const hasDraft = form.formState.isDirty;
  const selectedPatient = form.watch("patient_id");
  const selectedDentist = form.watch("dentist_id");
  const missingPatient = !!selectedPatient && !patients.some(item => item.id === selectedPatient);
  const missingDentist = !!selectedDentist && !dentists.some(item => item.id === selectedDentist);
  const missingProcedures = selectedProcedureIds.filter(id => !procedureById.has(id));
  const missingReference = missingPatient || missingDentist || missingProcedures.length > 0;

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

  const isSubmitting = availabilityReview.reload.isPending || createMutation.isPending || updateMutation.isPending || reloadAppointmentMutation.isPending || deleteMutation.isPending;
  const periodLabel = useMemo(
    () => formatPeriodLabel(currentDate, currentView),
    [currentDate, currentView],
  );

  const updateAutomaticEnd = (start: string, ids: string[]) => {
    if (manualEndOverride || !references.ready) return;
    const end = suggestedClinicEnd(start, calculateSuggestedDuration(ids, procedureById), editingAppointment?.start_at);
    if (end) form.setValue("end_at", end, { shouldDirty: true, shouldValidate: true });
  };

  const toggleProcedure = (procedureId: string) => {
    const current = form.getValues("procedure_ids") ?? [];
    const next = current.includes(procedureId)
      ? current.filter((item) => item !== procedureId)
      : [...current, procedureId];

    form.setValue("procedure_ids", next, { shouldDirty: true, shouldValidate: false });
    updateAutomaticEnd(form.getValues("start_at"), next);
  };

  const applySuggestedDuration = () => {
    const suggestedEndAt = suggestedClinicEnd(form.getValues("start_at"), suggestedDurationMinutes, editingAppointment?.start_at);
    if (!suggestedEndAt) return;

    setManualEndOverride(false);
    form.setValue("end_at", suggestedEndAt, { shouldDirty: true, shouldValidate: true });
  };

  const openCreateModal = (interval?: { start: Date; end: Date }) => {
    if (!canCreate || isSubmitting || openModal) return;
    setReferenceAction(value => value + 1); setEditConflict(false);
    const start = interval?.start ?? new Date();
    const end = interval?.end ?? new Date(start.getTime() + 30 * 60 * 1000);

    availabilityReview.reset();
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

  const openEditModal = (appointment: Appointment, reviewing = false) => {
    if (!canUpdate || (!reviewing && (isSubmitting || openModal))) return;
    setReferenceAction(value => value + 1);
    availabilityReview.reset();
    setEditConflict(false);
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
    if (availabilityReview.blocked || availabilityReview.reload.isPending) return;
    if (isSubmitting || deleteReview || editConflict || !references.ready || missingReference) return;
    if (editingAppointment ? !canUpdate : !canCreate) return;
    const start = resolveClinicInput(values.start_at, editingAppointment?.start_at);
    const end = resolveClinicInput(values.end_at, editingAppointment?.end_at);
    if (!start.ok) form.setError("start_at", { message: clinicTimeError(start) });
    if (!end.ok) form.setError("end_at", { message: clinicTimeError(end) });
    if (!start.ok || !end.ok) return;
    if (!clinicIntervalIsPositive(start.iso, end.iso)) {
      form.setError("end_at", { message: "Horario final deve ser maior que o inicial." });
      return;
    }
    if (editingAppointment) {
      updateMutation.mutate({ appointment: editingAppointment, payload: values });
      return;
    }
    createMutation.mutate(values);
  };

  const goPrev = () => setCurrentDate((prev) => moveDateByView(prev, currentView, -1));
  const goNext = () => setCurrentDate((prev) => moveDateByView(prev, currentView, 1));
  const goToday = () => setCurrentDate(new Date());

  if (appointmentsQuery.accessDenied) return <p role="alert">Seu acesso à agenda foi encerrado. Entre novamente.</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Horários de São Paulo.</p>
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
            {canCreate && <Button disabled={appointmentsQuery.isPending || appointmentsQuery.isError} onClick={() => openCreateModal()}>Nova consulta</Button>}
          </div>
        </div>
      </Card>

      <div role="status" className="space-y-2">
        {!gridDentists.ready && <p>As cores dos dentistas estão carregando ou indisponíveis. A agenda usa cores alternativas.</p>}
        <Button variant="outline" disabled={openModal || gridDentists.status === "loading" || !can("dentists", "view")}
          onClick={() => void gridDentists.reload()}>Atualizar cores dos dentistas</Button>
      </div>
      <LiveQueryStatus query={appointmentsQuery} />
      {appointmentsQuery.data !== undefined && <Card>
        <div className="h-[720px]">
          <Calendar
            localizer={clinicCalendarLocalizer}
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
              if (!canUpdate || isSubmitting) return;
              openEditModal((event as CalendarEvent).resource);
            }}
            selectable={canCreate}
            onSelectSlot={(slot) => openCreateModal(clinicSelection(slot, currentView))}
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
      </Card>}

      <Modal
        open={openModal}
        onClose={() => { if (!isSubmitting) setOpenModal(false); }}
        title={editingAppointment ? "Editar consulta" : "Nova consulta"}
      >
        <div role="status" className="mb-3 space-y-2">
          {references.ready && <p>Cadastros preparados para esta consulta. Atualizar as opções mantém os horários preenchidos.</p>}
          {([["Pacientes", references.patients], ["Dentistas", references.dentists], ["Procedimentos", references.procedures]] as const).map(([label, source]) =>
            source.status !== "ready" && <p key={label}>{label}: {source.status === "denied" ? "sem acesso ao cadastro." : source.status === "error" ? "não foi possível carregar. Tente novamente." : "carregando..."}</p>)}
          <Button variant="outline" disabled={isSubmitting || references.loading} onClick={() => void references.reload()}>Atualizar cadastros do formulário</Button>
        </div>
        <AvailabilityReview review={availabilityReview} />
        <fieldset disabled={isSubmitting || !references.ready}>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={form.handleSubmit(onSubmit)}>
          {(editConflict || deleteReview) && editingAppointment && (
            <div role="alert" className="md:col-span-2 rounded-sm border border-amber-300 bg-amber-50 p-3">
              <p>{deleteReview ?? "Não foi possível salvar."} Seu rascunho permanece abaixo. Carregar a consulta atual substituirá os campos deste formulário.</p>
              <Button type="button" variant="outline" disabled={isSubmitting}
                onClick={() => reloadAppointmentMutation.mutate({ id: editingAppointment.id, action: referenceAction })}>
                Descartar rascunho e carregar consulta atual
              </Button>
              {deleteReview && <Button type="button" variant="outline" disabled={isSubmitting || appointmentsQuery.isFetching}
                onClick={() => void appointmentsQuery.refetch()}>Atualizar agenda sem descartar rascunho</Button>}
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Paciente *</label>
            <Select {...form.register("patient_id")}>
              <option value="">Selecione</option>
              {missingPatient && <option value={selectedPatient}>Paciente selecionado indisponível</option>}
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {`${patient.full_name}${patient.active === false ? " (inativo)" : ""}`}
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
              {missingDentist && <option value={selectedDentist}>Dentista selecionado indisponível</option>}
              {dentists.map((dentist) => (
                <option key={dentist.id} value={dentist.id}>
                  {`${dentist.full_name}${dentist.active === false ? " (inativo)" : ""}`}
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
              {missingProcedures.map(id => <label key={id} className="block"><input type="checkbox" checked onChange={() => toggleProcedure(id)} /> Procedimento selecionado indisponível ({id})</label>)}
              {procedures.length === 0 && references.procedures.ready ? (
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
                        {procedure.name}{procedure.active === false ? " (inativo)" : ""}
                        {procedure.duration_minutes ? (
                          <span className="ml-2 text-xs text-slate-500">
                            ({procedure.duration_minutes} min)
                          </span>
                        ) : (
                          <span className="ml-2 text-xs text-slate-500">(sem duração)</span>
                        )}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {suggestedDurationMinutes > 0
                ? `Duração sugerida: ${suggestedDurationMinutes} min`
                : "Selecione procedimentos para sugerir a duração."}
            </p>
            {suggestedDurationMinutes > 0 && (
              <Button
                type="button"
                variant="outline"
                className="mt-2 px-3 py-1 text-xs"
                onClick={applySuggestedDuration}
              >
                Aplicar duração sugerida
              </Button>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Início *</label>
            <Input type="datetime-local" {...form.register("start_at", { onChange: event => updateAutomaticEnd(event.target.value, form.getValues("procedure_ids") ?? []) })} />
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

          {references.ready && missingReference && <p role="alert" className="md:col-span-2">Há cadastros selecionados indisponíveis. Escolha paciente/dentista disponíveis ou remova os procedimentos ausentes antes de salvar.</p>}
          <div className="md:col-span-2 mt-2 flex justify-between gap-2">
            <div>
              {editingAppointment && canDelete && (
                <Button
                  type="button"
                  variant="danger"
                  disabled={isSubmitting || deleteReview !== null}
                  onClick={() => {
                    if (isSubmitting || deleteReview !== null || !references.ready) return;
                    const target = { id: editingAppointment.id, version: editingAppointment.version };
                    if (window.confirm(appointmentDeletionConfirmation(editingAppointment, hasDraft))) {
                      deleteMutation.mutate(target);
                    }
                  }}
                >
                  Excluir
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {references.ready && <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => setOpenModal(false)}>
                Cancelar
              </Button>}
              <Button type="submit" disabled={availabilityReview.blocked || isSubmitting || deleteReview !== null || editConflict || !references.ready || missingReference}>
                {isSubmitting ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </form>
        </fieldset>
        {!references.ready && <Button variant="outline" disabled={isSubmitting} onClick={() => setOpenModal(false)}>Cancelar</Button>}
      </Modal>
    </div>
  );
}
