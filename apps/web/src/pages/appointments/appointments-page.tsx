import { AvailabilityReview, useAvailabilityReview } from "@/hooks/use-availability-review";
import { useLiveQuery } from "@/hooks/use-live-query";
import { LiveQueryStatus } from "@/components/ui/live-query-status";
import { zodResolver } from "@hookform/resolvers/zod";
import { isAxiosError } from "axios";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { fromInputDateTime, toInputDateTime } from "@/lib/datetime";
import { useCatalogDeletion } from "@/hooks/use-catalog-deletion";
import { usePermissions } from "@/hooks/use-permissions";
import { appointmentDeletionConfirmation } from "@/lib/appointment-deletion";
import { getApiErrorMessage } from "@/lib/api";
import { appointmentStatusLabels, appointmentStatusOptions } from "@/lib/labels";
import { appointmentService } from "@/lib/services";
import { useAppointmentReferences } from "./use-appointment-references";
import type { Appointment, Procedure } from "@/types";

const appointmentSchema = z
  .object({
    patient_id: z.string().uuid("Selecione um paciente."),
    dentist_id: z.string().uuid("Selecione um dentista."),
    procedure_ids: z.array(z.string().uuid()).default([]),
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

function formatProcedureList(
  procedureIds: string[] | undefined,
  procedureById: Map<string, Procedure>,
): string {
  if (!procedureIds || procedureIds.length === 0) return "-";

  const labels = procedureIds.map((procedureId) => procedureById.get(procedureId)?.name ?? "Procedimento");
  return labels.join(", ");
}

export function AppointmentsPage() {
  const { toast } = useToast();
  const { can } = usePermissions();
  const queryClient = useQueryClient();

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [dentistFilter, setDentistFilter] = useState("");
  const [patientFilter, setPatientFilter] = useState("");

  const [openModal, setOpenModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [editConflict, setEditConflict] = useState(false);
  const [manualEndOverride, setManualEndOverride] = useState(false);
  const [referenceAction, setReferenceAction] = useState(0);
  const references = useAppointmentReferences(openModal ? referenceAction : null);
  const pageReferences = useAppointmentReferences(0);
  const mounted = useRef(false);
  const pendingReload = useRef<AbortController>();
  const actionScope = useRef({ openModal, referenceAction });
  actionScope.current = { openModal, referenceAction };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => () => { pendingReload.current?.abort(); pendingReload.current = undefined; }, [openModal, referenceAction]);
  // A denied form read must also remove the page's previously authorized copy.
  useEffect(() => { if (references.patients.status === "denied") pageReferences.patients.deny(); }, [references.patients.status, pageReferences.patients.deny]);
  useEffect(() => { if (references.dentists.status === "denied") pageReferences.dentists.deny(); }, [references.dentists.status, pageReferences.dentists.deny]);
  useEffect(() => { if (references.procedures.status === "denied") pageReferences.procedures.deny(); }, [references.procedures.status, pageReferences.procedures.deny]);

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
    ["appointments", fromDate, toDate, dentistFilter, patientFilter],
    (signal) =>
      appointmentService.list({
        from: fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : undefined,
        to: toDate ? new Date(`${toDate}T23:59:59`).toISOString() : undefined,
        dentist_id: dentistFilter || undefined,
        patient_id: patientFilter || undefined,
      }, signal),
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
      pendingReload.current?.abort();
      pendingReload.current = new AbortController();
      return appointmentService.get(id, pendingReload.current.signal);
    },
    onSuccess: (appointment, request) => {
      if (!mounted.current || !actionScope.current.openModal || actionScope.current.referenceAction !== request.action) return;
      onEdit(appointment, true);
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (error, request) => {
      if (mounted.current && actionScope.current.openModal && actionScope.current.referenceAction === request.action)
        toast(getApiErrorMessage(error), "error");
    },
  });

  const deletion = useCatalogDeletion(appointmentService.remove, () => appointmentsQuery.refetch(), () => {
    toast("Consulta removida.");
    void queryClient.invalidateQueries({ queryKey: ["appointments"] });
    void queryClient.invalidateQueries({ queryKey: ["financial"] });
  });

  const items = useMemo(() => appointmentsQuery.data ?? [], [appointmentsQuery.data]);
  const patients = references.patients.items;
  const dentists = references.dentists.items;
  const procedures = references.procedures.items;
  const pageProcedureById = new Map(pageReferences.procedures.items.map(procedure => [procedure.id, procedure]));
  const procedureById = useMemo(
    () => new Map(procedures.map((procedure) => [procedure.id, procedure])),
    [procedures],
  );
  const selectedProcedureIds = form.watch("procedure_ids") ?? [];
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

  const isSubmitting = availabilityReview.reload.isPending || createMutation.isPending || updateMutation.isPending || reloadAppointmentMutation.isPending || deletion.mutation.isPending;

  const updateAutomaticEnd = (start: string, ids: string[]) => {
    if (manualEndOverride || !references.ready) return;
    const end = toSuggestedEndAt(start, calculateSuggestedDuration(ids, procedureById));
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
    const suggestedEndAt = toSuggestedEndAt(form.getValues("start_at"), suggestedDurationMinutes);
    if (!suggestedEndAt) return;

    setManualEndOverride(false);
    form.setValue("end_at", suggestedEndAt, { shouldDirty: true, shouldValidate: true });
  };

  const onNew = () => {
    if (!canCreate || isSubmitting || openModal) return;
    setReferenceAction(value => value + 1);
    setEditConflict(false);
    const start = new Date();
    const end = new Date(start.getTime() + 30 * 60 * 1000);

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

  const onEdit = (appointment: Appointment, reviewing = false) => {
    if (!canUpdate || (!reviewing && (isSubmitting || openModal))) return;
    setReferenceAction(value => value + 1);
    availabilityReview.reset();
    setEditConflict(false);
    if (!canUpdate) return;
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
    if (availabilityReview.blocked || isSubmitting || editConflict || !references.ready || missingReference) return;
    if (editingAppointment ? !canUpdate : !canCreate) return;
    if (editingAppointment) {
      updateMutation.mutate({ appointment: editingAppointment, payload: values });
      return;
    }
    createMutation.mutate(values);
  };

  if (appointmentsQuery.accessDenied) return <ErrorState message="Seu acesso à agenda foi encerrado. Entre novamente." />;

  return (
    <div className="space-y-4">
      {deletion.review && <div role="alert" className="rounded-sm border border-amber-300 p-3 space-y-2">
        <p>{deletion.review}</p>
        <p>Confira os dados atualizados e confirme novamente se ainda quiser excluir.</p>
        <Button disabled={deletion.reload.isPending} onClick={() => deletion.reload.mutate()}>Recarregar lista para conferir</Button>
      </div>}
      <Card>
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />

          <Select value={dentistFilter} onChange={(event) => setDentistFilter(event.target.value)}>
            <option value="">Todos dentistas</option>
            {dentistFilter && !pageReferences.dentists.items.some(item => item.id === dentistFilter) && <option value={dentistFilter}>Dentista selecionado indisponível</option>}
            {pageReferences.dentists.items.map((dentist) => (
              <option key={dentist.id} value={dentist.id}>
                {dentist.full_name}
              </option>
            ))}
          </Select>

          <Select value={patientFilter} onChange={(event) => setPatientFilter(event.target.value)}>
            <option value="">Todos pacientes</option>
            {patientFilter && !pageReferences.patients.items.some(item => item.id === patientFilter) && <option value={patientFilter}>Paciente selecionado indisponível</option>}
            {pageReferences.patients.items.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.full_name}
              </option>
            ))}
          </Select>

          {canCreate && <Button onClick={onNew}>Nova</Button>}
        </div>
      </Card>

      <div role="status" className="space-y-2">
        {!pageReferences.ready && <p>Alguns cadastros dos filtros e da tabela estão carregando ou indisponíveis.</p>}
        <Button variant="outline" disabled={openModal || pageReferences.loading} onClick={() => void pageReferences.reload()}>Atualizar cadastros dos filtros</Button>
      </div>
      <LiveQueryStatus query={appointmentsQuery} />

      {appointmentsQuery.data !== undefined && (
        <Card>
          {items.length === 0 ? (
            <EmptyState message="Nenhuma consulta encontrada para o filtro informado." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 font-semibold">Paciente</th>
                    <th className="p-2 font-semibold">Dentista</th>
                    <th className="p-2 font-semibold">Procedimentos</th>
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
                      <td className="p-2">{formatProcedureList(appointment.procedure_ids, pageProcedureById)}</td>
                      <td className="p-2">{new Date(appointment.start_at).toLocaleString("pt-BR")}</td>
                      <td className="p-2">{new Date(appointment.end_at).toLocaleString("pt-BR")}</td>
                      <td className="p-2">{appointmentStatusLabels[appointment.status]}</td>
                      <td className="p-2">
                        {!canUpdate && !canDelete ? (
                          <span className="text-slate-400">-</span>
                        ) : (
                          <div className="flex gap-2">
                            {canUpdate && (
                              <Button variant="outline" onClick={() => onEdit(appointment)}>
                                Editar
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                variant="danger"
                                disabled={deletion.blocked}
                                onClick={() => {
                                  const target = { id: appointment.id, version: appointment.version };
                                  if (window.confirm(appointmentDeletionConfirmation(appointment))) {
                                    deletion.mutation.mutate(target);
                                  }
                                }}
                              >
                                Excluir
                              </Button>
                            )}
                          </div>
                        )}
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
          {editConflict && editingAppointment && (
            <div role="alert" className="md:col-span-2 rounded-sm border border-amber-300 bg-amber-50 p-3">
              <p>Não foi possível salvar. Seu rascunho permanece abaixo. Carregar a consulta atual substituirá os campos deste formulário.</p>
              <Button type="button" variant="outline" disabled={isSubmitting}
                onClick={() => reloadAppointmentMutation.mutate({ id: editingAppointment.id, action: referenceAction })}>
                Descartar rascunho e carregar atual
              </Button>
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
          <div className="md:col-span-2 mt-2 flex justify-end gap-2">
              {references.ready && <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => setOpenModal(false)}>
              Cancelar
            </Button>}
            <Button type="submit" disabled={availabilityReview.blocked || isSubmitting || editConflict || !references.ready || missingReference}>
              {isSubmitting ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
        </fieldset>
        {!references.ready && <Button variant="outline" disabled={isSubmitting} onClick={() => setOpenModal(false)}>Cancelar</Button>}
      </Modal>
    </div>
  );
}
