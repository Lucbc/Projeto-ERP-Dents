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
import { usePermissions } from "@/hooks/use-permissions";
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
  dentistService,
  financialService,
  patientService,
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

export function FinancialPage() {
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

  const patientsQuery = useQuery({
    queryKey: ["patients", "financial-form"],
    queryFn: () => patientService.listAll(),
  });

  const dentistsQuery = useQuery({
    queryKey: ["dentists", "financial-form"],
    queryFn: () => dentistService.listAll(),
  });

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

  const financialEntriesQuery = useQuery({
    queryKey: [
      "financial",
      search,
      entryTypeFilter,
      statusFilter,
      fromDate,
      toDate,
      patientFilter,
      dentistFilter,
    ],
    queryFn: () =>
      financialService.list({
        search: search || undefined,
        entry_type: (entryTypeFilter || undefined) as "income" | "expense" | undefined,
        status: (statusFilter || undefined) as "pending" | "paid" | "cancelled" | undefined,
        from: fromDate || undefined,
        to: toDate || undefined,
        patient_id: patientFilter || undefined,
        dentist_id: dentistFilter || undefined,
        limit: 200,
        offset: 0,
      }),
  });

  const summaryQuery = useQuery({
    queryKey: ["financial", "summary", fromDate, toDate],
    queryFn: () =>
      financialService.summary({
        from: fromDate || undefined,
        to: toDate || undefined,
      }),
  });

  const createMutation = useMutation({
    mutationFn: (payload: FinancialForm) =>
      financialService.create({
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
      toast("Lancamento financeiro cadastrado com sucesso.");
      setOpenEntryModal(false);
      setEditingEntry(null);
      entryForm.reset();
      void queryClient.invalidateQueries({ queryKey: ["financial"] });
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: FinancialForm }) =>
      financialService.update(id, {
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
      toast("Lancamento financeiro atualizado com sucesso.");
      setOpenEntryModal(false);
      setEditingEntry(null);
      entryForm.reset();
      void queryClient.invalidateQueries({ queryKey: ["financial"] });
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => financialService.remove(id),
    onSuccess: () => {
      toast("Lancamento removido.");
      void queryClient.invalidateQueries({ queryKey: ["financial"] });
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const markAsPaidMutation = useMutation({
    mutationFn: (id: string) => financialService.markAsPaid(id),
    onSuccess: () => {
      toast("Lancamento baixado como pago.");
      void queryClient.invalidateQueries({ queryKey: ["financial"] });
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const generateFromAppointmentMutation = useMutation({
    mutationFn: (payload: GenerateFromAppointmentForm) =>
      financialService.generateFromAppointment(payload.appointment_id, {
        due_date: nullable(payload.due_date),
        status: payload.status,
        paid_at: payload.paid_at ? fromInputDateTime(payload.paid_at) : null,
        payment_method: payload.payment_method || null,
        notes: nullable(payload.notes),
      }),
    onSuccess: () => {
      toast("Lancamento financeiro gerado com base na consulta.");
      setOpenGenerateModal(false);
      generateForm.reset();
      void queryClient.invalidateQueries({ queryKey: ["financial"] });
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const patients = useMemo(() => patientsQuery.data?.items ?? [], [patientsQuery.data]);
  const dentists = useMemo(() => dentistsQuery.data?.items ?? [], [dentistsQuery.data]);
  const entries = useMemo(() => financialEntriesQuery.data?.items ?? [], [financialEntriesQuery.data]);
  const appointmentsForGenerate = useMemo(
    () =>
      (appointmentsForGenerateQuery.data ?? []).filter((appointment) => appointment.status !== "cancelled"),
    [appointmentsForGenerateQuery.data],
  );

  const canCreate = can("financial", "create");
  const canUpdate = can("financial", "update");
  const canDelete = can("financial", "delete");
  const isSubmittingEntry = createMutation.isPending || updateMutation.isPending;
  const isGeneratingEntry = generateFromAppointmentMutation.isPending;

  const onNewEntry = () => {
    if (!canCreate) return;
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

  const onEditEntry = (entry: FinancialEntry) => {
    if (!canUpdate) return;
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

  const submitEntry = (values: FinancialForm) => {
    if (editingEntry) {
      updateMutation.mutate({ id: editingEntry.id, payload: values });
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
              <Button variant="outline" onClick={() => setOpenGenerateModal(true)}>
                Gerar da consulta
              </Button>
              <Button onClick={onNewEntry}>Novo lancamento</Button>
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-500">Receitas (periodo)</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700">
            {formatCurrency(summaryQuery.data?.income_total_cents ?? 0)}
          </p>
          <p className="text-xs text-slate-500">
            Recebido: {formatCurrency(summaryQuery.data?.received_cents ?? 0)}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-500">Despesas (periodo)</p>
          <p className="mt-1 text-2xl font-semibold text-rose-700">
            {formatCurrency(summaryQuery.data?.expense_total_cents ?? 0)}
          </p>
          <p className="text-xs text-slate-500">
            Pagas: {formatCurrency(summaryQuery.data?.paid_expense_cents ?? 0)}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-500">Pendencias</p>
          <p className="mt-1 text-2xl font-semibold text-amber-700">
            {formatCurrency(
              (summaryQuery.data?.pending_income_cents ?? 0) +
                (summaryQuery.data?.pending_expense_cents ?? 0),
            )}
          </p>
          <p className="text-xs text-slate-500">
            Vencidos: {formatCurrency(summaryQuery.data?.overdue_income_cents ?? 0)}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-500">Saldo realizado</p>
          <p className="mt-1 text-2xl font-semibold text-cyan-700">
            {formatCurrency(summaryQuery.data?.balance_cents ?? 0)}
          </p>
          <p className="text-xs text-slate-500">Lancamentos: {summaryQuery.data?.entries_count ?? 0}</p>
        </Card>
      </div>

      <Card>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Input
            placeholder="Buscar por descricao, paciente ou dentista"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select value={entryTypeFilter} onChange={(event) => setEntryTypeFilter(event.target.value)}>
            <option value="">Todos tipos</option>
            {financialEntryTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">Todos status</option>
            {financialEntryStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
            <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </div>
          <Select value={patientFilter} onChange={(event) => setPatientFilter(event.target.value)}>
            <option value="">Todos pacientes</option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.full_name}
              </option>
            ))}
          </Select>
          <Select value={dentistFilter} onChange={(event) => setDentistFilter(event.target.value)}>
            <option value="">Todos dentistas</option>
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

      {financialEntriesQuery.isLoading && <LoadingState message="Carregando lancamentos financeiros..." />}
      {financialEntriesQuery.isError && <ErrorState message="Erro ao carregar lancamentos financeiros." />}

      {!financialEntriesQuery.isLoading && !financialEntriesQuery.isError && (
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
                    <th className="p-2 font-semibold">Paciente</th>
                    <th className="p-2 font-semibold">Dentista</th>
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
                        {!canUpdate && !canDelete ? (
                          <span className="text-slate-400">-</span>
                        ) : (
                          <div className="flex gap-2">
                            {canUpdate && (
                              <Button variant="outline" onClick={() => onEditEntry(entry)}>
                                Editar
                              </Button>
                            )}
                            {canUpdate && entry.status === "pending" && (
                              <Button
                                variant="outline"
                                onClick={() => markAsPaidMutation.mutate(entry.id)}
                                disabled={markAsPaidMutation.isPending}
                              >
                                Baixar
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                variant="danger"
                                onClick={() => {
                                  if (window.confirm("Deseja remover este lancamento?")) {
                                    deleteMutation.mutate(entry.id);
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
        open={openEntryModal}
        onClose={() => {
          setOpenEntryModal(false);
          setEditingEntry(null);
        }}
        title={editingEntry ? "Editar lancamento financeiro" : "Novo lancamento financeiro"}
      >
        <form className="grid gap-3 md:grid-cols-2" onSubmit={entryForm.handleSubmit(submitEntry)}>
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
              {financialEntryStatusOptions.map((option) => (
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
            <Select {...entryForm.register("patient_id")}>
              <option value="">Nao vincular</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.full_name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Dentista</label>
            <Select {...entryForm.register("dentist_id")}>
              <option value="">Nao vincular</option>
              {dentists.map((dentist) => (
                <option key={dentist.id} value={dentist.id}>
                  {dentist.full_name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Consulta vinculada</label>
            <Select {...entryForm.register("appointment_id")} disabled={!canViewAppointments}>
              <option value="">Nao vincular</option>
              {appointmentsForGenerate.map((appointment) => (
                <option key={appointment.id} value={appointment.id}>
                  {formatAppointmentLabel(appointment)}
                </option>
              ))}
            </Select>
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
              onClick={() => {
                setOpenEntryModal(false);
                setEditingEntry(null);
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmittingEntry}>
              {isSubmittingEntry ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={openGenerateModal}
        onClose={() => setOpenGenerateModal(false)}
        title="Gerar lancamento financeiro da consulta"
      >
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
                <option value="paid">Pago</option>
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
          </form>
        )}
      </Modal>
    </div>
  );
}
