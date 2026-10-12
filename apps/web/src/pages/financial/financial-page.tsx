import { useFinancialReferences } from "./use-financial-references";
import { PaymentDialog } from "./payment-dialog";
import { uncertainFinancialEntry } from "@/lib/financial-attempt";
import { isAxiosError } from "axios";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { usePermissions } from "@/hooks/use-permissions";
import { useLiveQuery } from "@/hooks/use-live-query";
import { LiveQueryStatus } from "@/components/ui/live-query-status";
import { getApiErrorMessage } from "@/lib/api";
import { fromInputDateTime, toInputDateTime } from "@/lib/datetime";
import {
  financialEntryStatusLabels,
  financialEntryStatusOptions,
  financialEntryTypeLabels,
  financialEntryTypeOptions,
  paymentMethodOptions,
} from "@/lib/labels";
import {
  appointmentService,
  financialService,
} from "@/lib/services";
import type { Appointment, FinancialEntry, PaymentMethod } from "@/types";

const paymentMethods = paymentMethodOptions.map((item) => item.value) as [
  PaymentMethod,
  ...PaymentMethod[],
];

const financialSchema = z.object({
  entry_type: z.enum(["income", "expense"]),
  description: z.string().min(2, "Descricao obrigatoria."),
  amount: z.coerce.number().min(0, "Valor deve ser maior ou igual a zero."),
  discount: z.coerce.number().min(0, "Desconto nao pode ser negativo."),
  tax: z.coerce.number().min(0, "Acrescimo nao pode ser negativo."),
  due_date: z.string().min(1, "Data de vencimento obrigatoria."),
  status: z.enum(["pending", "paid", "cancelled"]),
  paid_at: z.string().optional(),
  payment_method: z.enum(paymentMethods).or(z.literal("")),
  patient_id: z.string().optional(),
  dentist_id: z.string().optional(),
  appointment_id: z.string().optional(),
  notes: z.string().optional(),
});

const generateFromAppointmentSchema = z.object({
  appointment_id: z.string().uuid("Selecione uma consulta."),
  due_date: z.string().optional(),
  status: z.enum(["pending", "paid"]),
  paid_at: z.string().optional(),
  payment_method: z.enum(paymentMethods).or(z.literal("")),
  notes: z.string().optional(),
});

type FinancialForm = z.infer<typeof financialSchema>;
type GenerateFromAppointmentForm = z.infer<typeof generateFromAppointmentSchema>;

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

function nullable(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function nullableUuid(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function formatAppointmentLabel(appointment: Appointment): string {
  const when = new Date(appointment.start_at).toLocaleString("pt-BR");
  const patient = appointment.patient_name ?? "Paciente";
  const dentist = appointment.dentist_name ?? "Dentista";
  return `${when} - ${patient} / ${dentist}`;
}

function resolveStatusLabel(entry: FinancialEntry): string {
  if (entry.is_overdue && entry.status === "pending") return "Vencido";
  return financialEntryStatusLabels[entry.status];
}

type FinancialRead = <T>(read: () => Promise<T>) => Promise<T>;

export function FinancialPage() {
  const client = useQueryClient();
  const [denied, setDenied] = useState(false);
  const guard: FinancialRead = useCallback(async read => {
    try { return await read(); }
    catch (error) {
      if (isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0)) setDenied(true);
      throw error;
    }
  }, []);
  useEffect(() => {
    if (!denied) return;
    void client.cancelQueries({ queryKey: ["financial"] });
    client.removeQueries({ queryKey: ["financial"] });
  }, [denied, client]);
  if (denied) return <ErrorState message="Seu acesso ao financeiro foi encerrado. Entre novamente nesta página após revisar o acesso." />;
  return <FinancialContent guard={guard} />;
}

function FinancialContent({ guard }: { guard: FinancialRead }) {
  const { toast } = useToast();
  const { can } = usePermissions();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [entryTypeFilter, setEntryTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [patientFilter, setPatientFilter] = useState("");
  const [dentistFilter, setDentistFilter] = useState("");

  const [openEntryModal, setOpenEntryModal] = useState(false);
  const [openGenerateModal, setOpenGenerateModal] = useState(false);
  const [editConflict, setEditConflict] = useState(false);
  const [actionConflict, setActionConflict] = useState(false);
  const [paymentDialog, setPaymentDialog] = useState<{ entry: FinancialEntry; mode: "pay" | "history" } | null>(null);
  const [createUncertain, setCreateUncertain] = useState(false);
  const [generateUncertain, setGenerateUncertain] = useState(false);
  const [reviewCreation, setReviewCreation] = useState(uncertainFinancialEntry("creation"));
  const createAttempt = useRef<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<FinancialEntry | null>(null);

  const entryForm = useForm<FinancialForm>({
    resolver: zodResolver(financialSchema),
    defaultValues: {
      entry_type: "income",
      description: "",
      amount: 0,
      discount: 0,
      tax: 0,
      due_date: "",
      status: "pending",
      paid_at: "",
      payment_method: "",
      patient_id: "",
      dentist_id: "",
      appointment_id: "",
      notes: "",
    },
  });

  const generateForm = useForm<GenerateFromAppointmentForm>({
    resolver: zodResolver(generateFromAppointmentSchema),
    defaultValues: {
      appointment_id: "",
      due_date: "",
      status: "pending",
      paid_at: "",
      payment_method: "",
      notes: "",
    },
  });

  const [entryAction, setEntryAction] = useState(0);
  const pageReferences = useFinancialReferences(0, false);
  const references = useFinancialReferences(openEntryModal ? entryAction : null);
  const mounted = useRef(false);
  const reloadController = useRef<AbortController>();
  const entryScope = useRef({ open: openEntryModal, action: entryAction });
  entryScope.current = { open: openEntryModal, action: entryAction };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; reloadController.current?.abort(); };
  }, []);
  useEffect(() => () => { reloadController.current?.abort(); }, [openEntryModal, entryAction]);
  useEffect(() => {
    if (openEntryModal && references.patients.status === "denied") pageReferences.patients.deny();
  }, [openEntryModal, references.patients.status, pageReferences.patients.deny]);
  useEffect(() => {
    if (openEntryModal && references.dentists.status === "denied") pageReferences.dentists.deny();
  }, [openEntryModal, references.dentists.status, pageReferences.dentists.deny]);

  const canViewAppointments = can("appointments", "view");
  const appointmentsForGenerateQuery = useQuery({
    queryKey: ["appointments", "financial-generate"],
    enabled: canViewAppointments,
    queryFn: async () => {
      const now = new Date();
      const from = new Date(now);
      const to = new Date(now);
      from.setMonth(from.getMonth() - 6);
      to.setMonth(to.getMonth() + 6);
      return appointmentService.list({
        from: from.toISOString(),
        to: to.toISOString(),
      });
    },
  });

  const financialEntriesQuery = useLiveQuery(
    [
      "financial",
      "list",
      search,
      entryTypeFilter,
      statusFilter,
      fromDate,
      toDate,
      patientFilter,
      dentistFilter,
    ],
    (signal) => guard(() => financialService.list({
        search: search || undefined,
        entry_type: (entryTypeFilter || undefined) as "income" | "expense" | undefined,
        status: (statusFilter || undefined) as "pending" | "paid" | "cancelled" | undefined,
        from: fromDate || undefined,
        to: toDate || undefined,
        patient_id: patientFilter || undefined,
        dentist_id: dentistFilter || undefined,
        limit: 200,
        offset: 0,
      }, signal)),
  );

  const summaryQuery = useLiveQuery(
    ["financial", "summary", fromDate, toDate],
    (signal) => guard(() => financialService.summary({
        from: fromDate || undefined,
        to: toDate || undefined,
      }, signal)),
  );

  const createMutation = useMutation({
    mutationFn: (payload: FinancialForm) =>
      financialService.create({
        idempotency_key: createAttempt.current || (createAttempt.current = crypto.randomUUID()),
        entry_type: payload.entry_type,
        description: payload.description.trim(),
        amount_cents: toCents(payload.amount),
        discount_cents: toCents(payload.discount),
        tax_cents: toCents(payload.tax),
        due_date: payload.due_date,
        status: payload.status,
        paid_at:
          payload.status === "paid"
            ? payload.paid_at
              ? fromInputDateTime(payload.paid_at)
              : null
            : null,
        payment_method: payload.payment_method || null,
        patient_id: nullableUuid(payload.patient_id),
        dentist_id: nullableUuid(payload.dentist_id),
        appointment_id: nullableUuid(payload.appointment_id),
        notes: nullable(payload.notes),
      }),
    onSuccess: () => {
      createAttempt.current = null; setCreateUncertain(false); uncertainFinancialEntry("creation", false);
      toast("Lancamento financeiro cadastrado com sucesso.");
      setOpenEntryModal(false);
      setEditingEntry(null);
      entryForm.reset();
      void queryClient.invalidateQueries({ queryKey: ["financial"] });
    },
    onError: (error) => {
      const unknown = !isAxiosError(error) || !error.response || error.response.status >= 500;
      setCreateUncertain(unknown);
      uncertainFinancialEntry("creation", unknown);
      if (!unknown) createAttempt.current = null;
      toast(getApiErrorMessage(error), "error");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, version, payload }: { id: string; version: number; payload: FinancialForm }) =>
      financialService.update(id, {
        version,
        entry_type: payload.entry_type,
        description: payload.description.trim(),
        amount_cents: toCents(payload.amount),
        discount_cents: toCents(payload.discount),
        tax_cents: toCents(payload.tax),
        due_date: payload.due_date,
        status: payload.status,
        paid_at:
          payload.status === "paid"
            ? payload.paid_at
              ? editingEntry?.paid_at && payload.paid_at === toInputDateTime(editingEntry.paid_at)
                ? editingEntry.paid_at
                : fromInputDateTime(payload.paid_at)
              : null
            : null,
        payment_method: payload.payment_method || null,
        patient_id: nullableUuid(payload.patient_id),
        dentist_id: nullableUuid(payload.dentist_id),
        appointment_id: nullableUuid(payload.appointment_id),
        notes: nullable(payload.notes),
      }),
    onSuccess: () => {
      toast("Lancamento financeiro atualizado com sucesso.");
      setOpenEntryModal(false);
      setEditingEntry(null);
      entryForm.reset();
      void queryClient.invalidateQueries({ queryKey: ["financial"] });
    },
    onError: (error) => {
      if (isAxiosError(error) && error.response?.status === 409 && error.response.data?.code === "stale_version") setEditConflict(true);
      toast(getApiErrorMessage(error), "error");
    },
  });

  const reloadEntryMutation = useMutation({
    mutationFn: async (id: string) => {
      const action = entryScope.current.action;
      const controller = new AbortController();
      reloadController.current?.abort();
      reloadController.current = controller;
      const entry = await financialService.get(id, controller.signal);
      return { entry, action, controller };
    },
    onSuccess: ({ entry, action, controller }) => {
      if (!mounted.current || controller.signal.aborted || !entryScope.current.open || entryScope.current.action !== action) return;
      onEditEntry(entry, true);
      void queryClient.invalidateQueries({ queryKey: ["financial"] });
    },
    onError: (error) => { if (mounted.current && !reloadController.current?.signal.aborted) toast(getApiErrorMessage(error), "error"); },
  });

  const onActionError = (error: unknown) => {
    if (isAxiosError(error) && error.response?.status === 409) setActionConflict(true);
    toast(getApiErrorMessage(error), "error");
  };

  const refreshActionsMutation = useMutation({
    mutationFn: async () => {
      const results = await Promise.all([financialEntriesQuery.refetch(), summaryQuery.refetch()]);
      for (const result of results) if (result.error) throw result.error;
    },
    onSuccess: () => setActionConflict(false),
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (entry: FinancialEntry) => financialService.remove(entry.id, entry.version),
    onSuccess: () => {
      toast("Lancamento removido.");
      void queryClient.invalidateQueries({ queryKey: ["financial"] });
    },
    onError: onActionError,
  });

  const generationAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const generateFromAppointmentMutation = useMutation({
    mutationFn: (payload: GenerateFromAppointmentForm) => {
      const request = {
        due_date: nullable(payload.due_date),
        status: payload.status,
        paid_at: payload.paid_at ? fromInputDateTime(payload.paid_at) : null,
        payment_method: payload.payment_method || null,
        notes: nullable(payload.notes),
      };
      const fingerprint = JSON.stringify([payload.appointment_id, request]);
      if (generationAttempt.current?.fingerprint !== fingerprint) {
        generationAttempt.current = { fingerprint, key: crypto.randomUUID() };
      }
      return financialService.generateFromAppointment(payload.appointment_id, {
        ...request, idempotency_key: generationAttempt.current.key,
      });
    },
    onSuccess: () => {
      generationAttempt.current = null; setGenerateUncertain(false); uncertainFinancialEntry("creation", false);
      toast("Lancamento financeiro gerado com base na consulta.");
      setOpenGenerateModal(false);
      generateForm.reset();
      void queryClient.invalidateQueries({ queryKey: ["financial"] });
    },
    onError: (error) => {
      const unknown = !isAxiosError(error) || !error.response || error.response.status >= 500;
      setGenerateUncertain(unknown); uncertainFinancialEntry("creation", unknown);
      toast(getApiErrorMessage(error), "error");
    },
  });

  const patients = pageReferences.patients.items;
  const dentists = pageReferences.dentists.items;
  const entries = useMemo(() => financialEntriesQuery.data?.items ?? [], [financialEntriesQuery.data]);
  const appointmentsForGenerate = useMemo(
    () =>
      (appointmentsForGenerateQuery.data ?? []).filter((appointment) => appointment.status !== "cancelled"),
    [appointmentsForGenerateQuery.data],
  );

  const canCreate = can("financial", "create") && !reviewCreation;
  const canUpdate = can("financial", "update");
  const canDelete = can("financial", "delete");
  const isSubmittingEntry = createMutation.isPending || updateMutation.isPending || reloadEntryMutation.isPending;
  const isGeneratingEntry = generateFromAppointmentMutation.isPending;

  const onNewEntry = () => {
    if (!canCreate || openEntryModal || openGenerateModal || isSubmittingEntry || createUncertain || generateUncertain) return;
    setEntryAction(action => action + 1);
    setEditConflict(false);
    setEditingEntry(null);
    entryForm.reset({
      entry_type: "income",
      description: "",
      amount: 0,
      discount: 0,
      tax: 0,
      due_date: new Date().toISOString().slice(0, 10),
      status: "pending",
      paid_at: "",
      payment_method: "",
      patient_id: "",
      dentist_id: "",
      appointment_id: "",
      notes: "",
    });
    setOpenEntryModal(true);
  };

  const onEditEntry = (entry: FinancialEntry, reviewing = false) => {
    if (!canUpdate || (!reviewing && (openEntryModal || openGenerateModal || isSubmittingEntry || createUncertain || generateUncertain))) return;
    setEntryAction(action => action + 1);
    setEditConflict(false);
    setEditingEntry(entry);
    entryForm.reset({
      entry_type: entry.entry_type,
      description: entry.description,
      amount: Number((entry.amount_cents / 100).toFixed(2)),
      discount: Number((entry.discount_cents / 100).toFixed(2)),
      tax: Number((entry.tax_cents / 100).toFixed(2)),
      due_date: entry.due_date,
      status: entry.status,
      paid_at: entry.paid_at ? toInputDateTime(entry.paid_at) : "",
      payment_method: entry.payment_method ?? "",
      patient_id: entry.patient_id ?? "",
      dentist_id: entry.dentist_id ?? "",
      appointment_id: entry.appointment_id ?? "",
      notes: entry.notes ?? "",
    });
    setOpenEntryModal(true);
  };

  const selectedPatient = entryForm.watch("patient_id");
  const selectedDentist = entryForm.watch("dentist_id");
  const selectedAppointment = entryForm.watch("appointment_id");
  const missingPatient = !!selectedPatient && !references.patients.items.some(item => item.id === selectedPatient);
  const missingDentist = !!selectedDentist && !references.dentists.items.some(item => item.id === selectedDentist);
  const missingAppointment = !!selectedAppointment && !references.appointments.items.some(item => item.id === selectedAppointment);
  const invalidReference = (missingPatient && selectedPatient !== editingEntry?.patient_id)
    || (missingDentist && selectedDentist !== editingEntry?.dentist_id)
    || (missingAppointment && selectedAppointment !== editingEntry?.appointment_id);
  const submitEntry = (values: FinancialForm) => {
    if (!openEntryModal || !references.ready || isSubmittingEntry || createUncertain || editConflict || invalidReference
      || editingEntry?.status === "paid" || (editingEntry ? !canUpdate : !canCreate)) return;
    if (editingEntry) {
      updateMutation.mutate({ id: editingEntry.id, version: editingEntry.version, payload: values });
      return;
    }
    createMutation.mutate(values);
  };

  const submitGenerate = (values: GenerateFromAppointmentForm) => {
    generateFromAppointmentMutation.mutate(values);
  };

  const clearFilters = () => {
    setSearch("");
    setEntryTypeFilter("");
    setStatusFilter("");
    setFromDate("");
    setToDate("");
    setPatientFilter("");
    setDentistFilter("");
  };

  return (
    <div className="space-y-4">
      {reviewCreation && <div role="alert" className="rounded-sm border border-amber-300 p-3"><p>Uma criação anterior ficou sem confirmação. Confira os lançamentos e pagamentos antes de criar outro.</p><Button disabled={!financialEntriesQuery.isSuccess || financialEntriesQuery.isFetching} onClick={() => { uncertainFinancialEntry("creation", false); setReviewCreation(false); }}>Conferi os lançamentos</Button></div>}
      {paymentDialog && <PaymentDialog key={paymentDialog.entry.id + paymentDialog.mode} entry={paymentDialog.entry} mode={paymentDialog.mode} guard={guard}
        onClose={() => setPaymentDialog(null)} onChanged={() => void queryClient.invalidateQueries({ queryKey: ["financial"] })} />}
      {actionConflict && (
        <div role="alert" className="rounded-sm border border-amber-300 bg-amber-50 p-3">
          <p>O lançamento mudou. Recarregue a lista e confira o estado atual antes de escolher uma nova ação. A operação não será repetida automaticamente.</p>
          <Button variant="outline" disabled={refreshActionsMutation.isPending}
            onClick={() => refreshActionsMutation.mutate()}>Recarregar financeiro</Button>
        </div>
      )}
      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-slate-800">Financeiro</h2>
            <p className="text-sm text-slate-500">
              Controle de receitas e despesas vinculado a consultas, pacientes e dentistas.
            </p>
          </div>
          {canCreate && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { if (!openEntryModal && !createUncertain && !generateUncertain) setOpenGenerateModal(true); }}>
                Gerar da consulta
              </Button>
              <Button onClick={onNewEntry}>Novo lancamento</Button>
            </div>
          )}
        </div>
      </Card>

      <section aria-label="Resumo financeiro" className="space-y-3">
      <h3 className="font-semibold">Resumo financeiro por vencimento</h3>
      <p className="text-sm text-muted-foreground">Considera apenas as datas de vencimento inicial e final. Busca, tipo, status, paciente e dentista filtram somente a lista. Sem datas, o resumo considera todo o período.</p>
      <LiveQueryStatus query={summaryQuery} subject="resumo financeiro" />
      {!summaryQuery.data && !summaryQuery.isError && <LoadingState message="Carregando resumo financeiro..." />}
      {summaryQuery.data && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-500">Receitas (periodo)</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700">
            {formatCurrency(summaryQuery.data.income_total_cents)}
          </p>
          <p className="text-xs text-slate-500">
            Recebido: {formatCurrency(summaryQuery.data.received_cents)}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-500">Despesas (periodo)</p>
          <p className="mt-1 text-2xl font-semibold text-rose-700">
            {formatCurrency(summaryQuery.data.expense_total_cents)}
          </p>
          <p className="text-xs text-slate-500">
            Pagas: {formatCurrency(summaryQuery.data.paid_expense_cents)}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-500">Pendencias</p>
          <p className="mt-1 text-2xl font-semibold text-amber-700">
            {formatCurrency(
                summaryQuery.data.pending_income_cents + summaryQuery.data.pending_expense_cents,
            )}
          </p>
          <p className="text-xs text-slate-500">
            Vencidos: {formatCurrency(summaryQuery.data.overdue_income_cents)}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-500">Saldo realizado</p>
          <p className="mt-1 text-2xl font-semibold text-cyan-700">
            {formatCurrency(summaryQuery.data.balance_cents)}
          </p>
          <p className="text-xs text-slate-500">Lancamentos: {summaryQuery.data.entries_count}</p>
        </Card>
      </div>}
      </section>

      <section aria-label="Lançamentos financeiros" className="space-y-3">
      <div role="status" className="text-sm text-muted-foreground">
        {pageReferences.loading ? "Carregando opções dos filtros..." : pageReferences.ready ? "Opções dos filtros preparadas; cadastros sem acesso ficam indisponíveis." : "Não foi possível preparar todos os filtros."}
        <Button variant="outline" disabled={pageReferences.loading || openEntryModal || openGenerateModal || createUncertain || generateUncertain}
          onClick={() => void pageReferences.reload()}>Atualizar opções dos filtros</Button>
      </div>
      <Card>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Input
            placeholder="Buscar por descricao, paciente ou dentista"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select aria-label="Filtrar por tipo" value={entryTypeFilter} onChange={(event) => setEntryTypeFilter(event.target.value)}>
            <option value="">Todos tipos</option>
            {financialEntryTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select aria-label="Filtrar por status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">Todos status</option>
            {financialEntryStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Input aria-label="Vencimento inicial" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
            <Input aria-label="Vencimento final" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </div>
          <Select disabled={!pageReferences.patients.ready} aria-label="Filtrar por paciente" value={patientFilter} onChange={(event) => setPatientFilter(event.target.value)}>
            <option value="">Todos pacientes</option>
            {patientFilter && !patients.some(item => item.id === patientFilter) && <option value={patientFilter}>Paciente indisponível — filtro mantido</option>}
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.full_name}
              </option>
            ))}
          </Select>
          <Select disabled={!pageReferences.dentists.ready} aria-label="Filtrar por dentista" value={dentistFilter} onChange={(event) => setDentistFilter(event.target.value)}>
            <option value="">Todos dentistas</option>
            {dentistFilter && !dentists.some(item => item.id === dentistFilter) && <option value={dentistFilter}>Dentista indisponível — filtro mantido</option>}
            {dentists.map((dentist) => (
              <option key={dentist.id} value={dentist.id}>
                {dentist.full_name}
              </option>
            ))}
          </Select>
          <div className="xl:col-span-2 flex justify-end">
            <Button variant="outline" onClick={clearFilters}>
              Limpar filtros
            </Button>
          </div>
        </div>
      </Card>

      <LiveQueryStatus query={financialEntriesQuery} subject="lançamentos financeiros" />
      {!financialEntriesQuery.data && !financialEntriesQuery.isError && <LoadingState message="Carregando lancamentos financeiros..." />}
      {financialEntriesQuery.data && <p className="text-sm text-muted-foreground">
        Exibindo {entries.length} de {financialEntriesQuery.data.total} lançamentos. Limite desta lista: 200.
        {financialEntriesQuery.data.total > entries.length && " Refine os filtros para localizar os demais lançamentos."}
      </p>}

      {financialEntriesQuery.data && (
        <Card>
          {entries.length === 0 ? (
            <EmptyState message="Nenhum lancamento financeiro encontrado para os filtros informados." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1280px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 font-semibold">Tipo</th>
                    <th className="p-2 font-semibold">Descricao</th>
                    <th className="p-2 font-semibold">Paciente atual</th>
                    <th className="p-2 font-semibold">Dentista atual</th>
                    <th className="p-2 font-semibold">Vencimento</th>
                    <th className="p-2 font-semibold">Status</th>
                    <th className="p-2 font-semibold">Valor total</th>
                    <th className="p-2 font-semibold">Pagamento</th>
                    <th className="p-2 font-semibold">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id} className="border-b last:border-b-0">
                      <td className="p-2">
                        <span
                          className={
                            entry.entry_type === "income"
                              ? "font-semibold text-emerald-700"
                              : "font-semibold text-rose-700"
                          }
                        >
                          {financialEntryTypeLabels[entry.entry_type]}
                        </span>
                      </td>
                      <td className="p-2 font-medium text-slate-800">{entry.description}</td>
                      <td className="p-2">{entry.patient_name ?? "-"}</td>
                      <td className="p-2">{entry.dentist_name ?? "-"}</td>
                      <td className="p-2">{new Date(`${entry.due_date}T00:00:00`).toLocaleDateString("pt-BR")}</td>
                      <td className="p-2">
                        <span
                          className={
                            entry.is_overdue && entry.status === "pending"
                              ? "font-semibold text-amber-700"
                              : "text-slate-700"
                          }
                        >
                          {resolveStatusLabel(entry)}
                        </span>
                      </td>
                      <td className="p-2 font-semibold">{formatCurrency(entry.total_cents)}</td>
                      <td className="p-2">
                        {entry.paid_at ? new Date(entry.paid_at).toLocaleString("pt-BR") : "-"}
                      </td>
                      <td className="p-2">
                          <div className="flex gap-2">
                            {canUpdate && entry.status !== "paid" && (
                              <Button variant="outline" onClick={() => onEditEntry(entry)}>
                                Editar
                              </Button>
                            )}
                            {canUpdate && entry.status === "pending" && (
                              <Button
                                variant="outline"
                                onClick={() => setPaymentDialog({ entry, mode: "pay" })}
                                disabled={deleteMutation.isPending || actionConflict}
                              >
                                Baixar
                              </Button>
                            )}
                            <Button variant="outline" onClick={() => setPaymentDialog({ entry, mode: "history" })}>{entry.has_payments || entry.status === "paid" ? "Ver pagamentos" : "Ver histórico"}</Button>
                            {canDelete && !entry.has_payments && entry.status !== "paid" && (
                              <Button
                                variant="danger"
                                disabled={deleteMutation.isPending || actionConflict}
                                onClick={() => {
                                  if (window.confirm("Deseja remover este lancamento?")) {
                                    deleteMutation.mutate(entry);
                                  }
                                }}
                              >
                                Excluir
                              </Button>
                            )}
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

      </section>
      <Modal
        open={openEntryModal}
        onClose={() => {
          if (isSubmittingEntry || createUncertain) return;
          setOpenEntryModal(false);
          setEditingEntry(null);
        }}
        title={editingEntry ? "Editar lancamento financeiro" : "Novo lancamento financeiro"}
      >
        {createUncertain && <div role="alert"><p>Resultado incerto. Confira a operação antes de criar outro lançamento.</p>
          {createMutation.variables?.status === "paid"
            ? <Button disabled={createMutation.isPending} onClick={() => createMutation.mutate(createMutation.variables!)}>Consultar/repetir criação</Button>
            : <Button onClick={() => { setOpenEntryModal(false); setCreateUncertain(false); setReviewCreation(true); createAttempt.current = null; void queryClient.invalidateQueries({ queryKey: ["financial"] }); }}>Fechar e conferir lançamentos</Button>}
        </div>}
        {editingEntry?.status === "paid" && <div role="alert"><p>Pagamento confirmado. Consulte os pagamentos para estornar antes de corrigir.</p><Button onClick={() => { setOpenEntryModal(false); setEditingEntry(null); }}>Fechar formulário</Button></div>}
        <div role="status" className="mb-3 space-y-2 text-sm">
          <p>{references.loading ? "Preparando referências do lançamento..." : references.ready ? "Referências do lançamento preparadas." : "Falha ao preparar referências do lançamento. Tente atualizar."}</p>
          {([ ["Pacientes", references.patients], ["Dentistas", references.dentists], ["Consultas", references.appointments] ] as const).map(([label, source]) =>
            source.status === "denied" ? <p key={label}>{label}: sem acesso ao catálogo; vínculos existentes são mantidos.</p> : null)}
          <p>Consultas disponíveis: seis meses antes e depois da leitura, sem canceladas. Vínculos anteriores fora da lista são mantidos.</p>
          <Button variant="outline" disabled={references.loading || isSubmittingEntry || createUncertain || editingEntry?.status === "paid"}
            onClick={() => void references.reload()}>Atualizar referências do lançamento</Button>
          {invalidReference && <p role="alert">Uma nova associação não está disponível. Atualize as referências ou remova o vínculo antes de salvar.</p>}
        </div>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={entryForm.handleSubmit(submitEntry)}>
          <fieldset disabled={!references.ready || isSubmittingEntry || createUncertain || editingEntry?.status === "paid"} className="contents">
          {editConflict && editingEntry && (
            <div role="alert" className="md:col-span-2 rounded-sm border border-amber-300 bg-amber-50 p-3">
              <p>Este lançamento mudou. Seu rascunho foi mantido. Carregar o atual substituirá valores, datas, status e vínculos deste formulário.</p>
              <Button type="button" variant="outline" disabled={isSubmittingEntry || createUncertain}
                onClick={() => reloadEntryMutation.mutate(editingEntry.id)}>Descartar rascunho e carregar atual</Button>
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Tipo *</label>
            <Select {...entryForm.register("entry_type")}>
              {financialEntryTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Status *</label>
            <Select {...entryForm.register("status")}>
              {financialEntryStatusOptions.filter(option => option.value !== "paid" || editingEntry?.status === "paid" || (!editingEntry && canUpdate)).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-semibold text-slate-700">Descricao *</label>
            <Input {...entryForm.register("description")} />
            {entryForm.formState.errors.description && (
              <p className="mt-1 text-xs text-red-600">{entryForm.formState.errors.description.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Valor base (R$) *</label>
            <Input type="number" min="0" step="0.01" {...entryForm.register("amount")} />
            {entryForm.formState.errors.amount && (
              <p className="mt-1 text-xs text-red-600">{entryForm.formState.errors.amount.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Vencimento *</label>
            <Input type="date" {...entryForm.register("due_date")} />
            {entryForm.formState.errors.due_date && (
              <p className="mt-1 text-xs text-red-600">{entryForm.formState.errors.due_date.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Desconto (R$)</label>
            <Input type="number" min="0" step="0.01" {...entryForm.register("discount")} />
            {entryForm.formState.errors.discount && (
              <p className="mt-1 text-xs text-red-600">{entryForm.formState.errors.discount.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Acrescimo (R$)</label>
            <Input type="number" min="0" step="0.01" {...entryForm.register("tax")} />
            {entryForm.formState.errors.tax && (
              <p className="mt-1 text-xs text-red-600">{entryForm.formState.errors.tax.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Paciente</label>
            <Select {...entryForm.register("patient_id")} disabled={references.patients.status === "denied"}>
              <option value="">Nao vincular</option>
              {missingPatient && <option value={selectedPatient}>Paciente fora da lista — vínculo mantido</option>}
              {references.patients.items.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.full_name}
                </option>
              ))}
            </Select>
            {entryForm.watch("patient_id") && <Button type="button" variant="outline" onClick={() => entryForm.setValue("patient_id", "", { shouldDirty: true })}>Remover vínculo de paciente</Button>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Dentista</label>
            <Select {...entryForm.register("dentist_id")} disabled={references.dentists.status === "denied"}>
              <option value="">Nao vincular</option>
              {missingDentist && <option value={selectedDentist}>Dentista fora da lista — vínculo mantido</option>}
              {references.dentists.items.map((dentist) => (
                <option key={dentist.id} value={dentist.id}>
                  {dentist.full_name}
                </option>
              ))}
            </Select>
            {entryForm.watch("dentist_id") && <Button type="button" variant="outline" onClick={() => entryForm.setValue("dentist_id", "", { shouldDirty: true })}>Remover vínculo de dentista</Button>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Consulta vinculada</label>
            <Select {...entryForm.register("appointment_id")} disabled={references.appointments.status === "denied"}>
              <option value="">Nao vincular</option>
              {missingAppointment && <option value={selectedAppointment}>Consulta fora da lista — vínculo mantido</option>}
              {references.appointments.items.map((appointment) => (
                <option key={appointment.id} value={appointment.id}>
                  {formatAppointmentLabel(appointment)}
                </option>
              ))}
            </Select>
            {entryForm.watch("appointment_id") && <Button type="button" variant="outline" onClick={() => entryForm.setValue("appointment_id", "", { shouldDirty: true })}>Remover vínculo de consulta</Button>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Forma de pagamento</label>
            <Select {...entryForm.register("payment_method")}>
              <option value="">Nao informada</option>
              {paymentMethodOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-semibold text-slate-700">Data/hora do pagamento</label>
            <Input type="datetime-local" {...entryForm.register("paid_at")} />
            <p className="mt-1 text-xs text-slate-500">
              Se o status estiver como Pago e este campo vazio, o sistema usa o horario atual.
            </p>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-semibold text-slate-700">Observacoes</label>
            <Textarea {...entryForm.register("notes")} />
          </div>

          <div className="md:col-span-2 mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmittingEntry || createUncertain}
              onClick={() => {
                setOpenEntryModal(false);
                setEditingEntry(null);
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmittingEntry || createUncertain || editConflict || invalidReference || (editingEntry ? !canUpdate : !canCreate)}>
              {isSubmittingEntry ? "Salvando..." : "Salvar"}
            </Button>
          </div>
          </fieldset>
          {!references.ready && <Button type="button" variant="outline" disabled={isSubmittingEntry || createUncertain}
            onClick={() => { setOpenEntryModal(false); setEditingEntry(null); }}>Cancelar preparação</Button>}
        </form>
      </Modal>

      <Modal
        open={openGenerateModal}
        onClose={() => { if (!isGeneratingEntry && !generateUncertain) setOpenGenerateModal(false); }}
        title="Gerar lancamento financeiro da consulta"
      >
        {generateUncertain && <div role="alert"><p>Resultado incerto. Repita os mesmos dados para recuperar a geração.</p><Button disabled={isGeneratingEntry} onClick={() => generateFromAppointmentMutation.mutate(generateFromAppointmentMutation.variables!)}>Consultar/repetir geração</Button></div>}
        {!canViewAppointments ? (
          <div className="space-y-2 text-sm text-slate-600">
            <p>Seu perfil nao possui permissao para listar consultas.</p>
            <p>Cadastre o lancamento manualmente no botao Novo lancamento.</p>
          </div>
        ) : appointmentsForGenerateQuery.isLoading ? (
          <LoadingState message="Carregando consultas para geracao..." />
        ) : appointmentsForGenerateQuery.isError ? (
          <ErrorState message="Erro ao carregar consultas para geracao." />
        ) : appointmentsForGenerate.length === 0 ? (
          <EmptyState message="Nenhuma consulta disponivel para gerar lancamento." />
        ) : (
          <form className="grid gap-3 md:grid-cols-2" onSubmit={generateForm.handleSubmit(submitGenerate)}>
            <fieldset disabled={isGeneratingEntry || generateUncertain} className="contents">
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-semibold text-slate-700">Consulta *</label>
              <Select {...generateForm.register("appointment_id")}>
                <option value="">Selecione</option>
                {appointmentsForGenerate.map((appointment) => (
                  <option key={appointment.id} value={appointment.id}>
                    {formatAppointmentLabel(appointment)}
                  </option>
                ))}
              </Select>
              {generateForm.formState.errors.appointment_id && (
                <p className="mt-1 text-xs text-red-600">
                  {generateForm.formState.errors.appointment_id.message}
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Vencimento</label>
              <Input type="date" {...generateForm.register("due_date")} />
              <p className="mt-1 text-xs text-slate-500">
                Se vazio, usa a data da consulta como vencimento.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Status</label>
              <Select {...generateForm.register("status")}>
                <option value="pending">Pendente</option>
                {canUpdate && <option value="paid">Pago</option>}
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Forma de pagamento</label>
              <Select {...generateForm.register("payment_method")}>
                <option value="">Nao informada</option>
                {paymentMethodOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Data/hora do pagamento</label>
              <Input type="datetime-local" {...generateForm.register("paid_at")} />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-semibold text-slate-700">Observacoes</label>
              <Textarea {...generateForm.register("notes")} />
            </div>

            <div className="md:col-span-2 mt-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpenGenerateModal(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isGeneratingEntry}>
                {isGeneratingEntry ? "Gerando..." : "Gerar"}
              </Button>
            </div>
            </fieldset>
          </form>
        )}
      </Modal>
    </div>
  );
}
