import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
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
import { formatDate } from "@/lib/datetime";
import { patientService } from "@/lib/services";
import type { Patient } from "@/types";

const patientSchema = z.object({
  full_name: z.string().min(2, "Nome completo e obrigatorio."),
  preferred_name: z.string().optional(),
  birth_date: z.string().optional(),
  cpf: z.string().optional(),
  rg: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("E-mail invalido.").or(z.literal("")).optional(),
  address: z.string().optional(),
  preferred_contact_method: z.string().optional(),
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: z.string().optional(),
  insurance_provider: z.string().optional(),
  insurance_plan: z.string().optional(),
  insurance_member_id: z.string().optional(),
  allergies: z.string().optional(),
  medical_history: z.string().optional(),
  notes: z.string().optional(),
  active: z.enum(["true", "false"]),
});

type PatientForm = z.infer<typeof patientSchema>;

function nullable(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";

  const areaCode = digits.slice(0, 2);
  const ninthDigit = digits.slice(2, 3);
  const firstBlock = digits.slice(3, 7);
  const secondBlock = digits.slice(7, 11);

  if (digits.length <= 2) return `(${areaCode}`;
  if (digits.length <= 3) return `(${areaCode}) ${ninthDigit}`;
  if (digits.length <= 7) return `(${areaCode}) ${ninthDigit}-${firstBlock}`;
  return `(${areaCode}) ${ninthDigit}-${firstBlock}-${secondBlock}`;
}

function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function normalizeRg(value: string): string {
  return value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 14);
}

export function PatientsPage() {
  const { toast } = useToast();
  const { can } = usePermissions();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [openModal, setOpenModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);

  const form = useForm<PatientForm>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      full_name: "",
      preferred_name: "",
      birth_date: "",
      cpf: "",
      rg: "",
      phone: "",
      email: "",
      address: "",
      preferred_contact_method: "",
      emergency_contact_name: "",
      emergency_contact_phone: "",
      insurance_provider: "",
      insurance_plan: "",
      insurance_member_id: "",
      allergies: "",
      medical_history: "",
      notes: "",
      active: "true",
    },
  });

  const patientsQuery = useQuery({
    queryKey: ["patients", search],
    queryFn: () => patientService.list({ search, limit: 100, offset: 0 }),
  });

  const createMutation = useMutation({
    mutationFn: (payload: PatientForm) =>
      patientService.create({
        full_name: payload.full_name,
        preferred_name: nullable(payload.preferred_name),
        birth_date: payload.birth_date || null,
        cpf: nullable(payload.cpf),
        rg: nullable(payload.rg),
        phone: nullable(payload.phone),
        email: nullable(payload.email),
        address: nullable(payload.address),
        preferred_contact_method: nullable(payload.preferred_contact_method),
        emergency_contact_name: nullable(payload.emergency_contact_name),
        emergency_contact_phone: nullable(payload.emergency_contact_phone),
        insurance_provider: nullable(payload.insurance_provider),
        insurance_plan: nullable(payload.insurance_plan),
        insurance_member_id: nullable(payload.insurance_member_id),
        allergies: nullable(payload.allergies),
        medical_history: nullable(payload.medical_history),
        notes: nullable(payload.notes),
        active: payload.active === "true",
      }),
    onSuccess: () => {
      toast("Paciente cadastrado com sucesso.");
      setOpenModal(false);
      form.reset();
      void queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: PatientForm }) =>
      patientService.update(id, {
        full_name: payload.full_name,
        preferred_name: nullable(payload.preferred_name),
        birth_date: payload.birth_date || null,
        cpf: nullable(payload.cpf),
        rg: nullable(payload.rg),
        phone: nullable(payload.phone),
        email: nullable(payload.email),
        address: nullable(payload.address),
        preferred_contact_method: nullable(payload.preferred_contact_method),
        emergency_contact_name: nullable(payload.emergency_contact_name),
        emergency_contact_phone: nullable(payload.emergency_contact_phone),
        insurance_provider: nullable(payload.insurance_provider),
        insurance_plan: nullable(payload.insurance_plan),
        insurance_member_id: nullable(payload.insurance_member_id),
        allergies: nullable(payload.allergies),
        medical_history: nullable(payload.medical_history),
        notes: nullable(payload.notes),
        active: payload.active === "true",
      }),
    onSuccess: () => {
      toast("Paciente atualizado com sucesso.");
      setOpenModal(false);
      setEditingPatient(null);
      form.reset();
      void queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => patientService.remove(id),
    onSuccess: () => {
      toast("Paciente removido.");
      void queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const canCreate = can("patients", "create");
  const canUpdate = can("patients", "update");
  const canDelete = can("patients", "delete");
  const canViewExams = can("exams", "view");

  const items = useMemo(() => patientsQuery.data?.items ?? [], [patientsQuery.data]);

  const onNew = () => {
    if (!canCreate) return;
    setEditingPatient(null);
    form.reset({
      full_name: "",
      preferred_name: "",
      birth_date: "",
      cpf: "",
      rg: "",
      phone: "",
      email: "",
      address: "",
      preferred_contact_method: "",
      emergency_contact_name: "",
      emergency_contact_phone: "",
      insurance_provider: "",
      insurance_plan: "",
      insurance_member_id: "",
      allergies: "",
      medical_history: "",
      notes: "",
      active: "true",
    });
    setOpenModal(true);
  };

  const onEdit = (patient: Patient) => {
    if (!canUpdate) return;
    setEditingPatient(patient);
    form.reset({
      full_name: patient.full_name,
      preferred_name: patient.preferred_name ?? "",
      birth_date: patient.birth_date ?? "",
      cpf: formatCpf(patient.cpf ?? ""),
      rg: patient.rg ?? "",
      phone: formatPhone(patient.phone ?? ""),
      email: patient.email ?? "",
      address: patient.address ?? "",
      preferred_contact_method: patient.preferred_contact_method ?? "",
      emergency_contact_name: patient.emergency_contact_name ?? "",
      emergency_contact_phone: formatPhone(patient.emergency_contact_phone ?? ""),
      insurance_provider: patient.insurance_provider ?? "",
      insurance_plan: patient.insurance_plan ?? "",
      insurance_member_id: patient.insurance_member_id ?? "",
      allergies: patient.allergies ?? "",
      medical_history: patient.medical_history ?? "",
      notes: patient.notes ?? "",
      active: patient.active ? "true" : "false",
    });
    setOpenModal(true);
  };

  const onSubmit = (values: PatientForm) => {
    if (editingPatient) {
      updateMutation.mutate({ id: editingPatient.id, payload: values });
      return;
    }
    createMutation.mutate(values);
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-slate-800">Pacientes</h2>
            <p className="text-sm text-slate-500">Cadastro e acompanhamento dos pacientes.</p>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Buscar por nome, CPF, RG, e-mail, telefone ou convenio"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="md:w-80"
            />
            {canCreate && <Button onClick={onNew}>Novo</Button>}
          </div>
        </div>
      </Card>

      {patientsQuery.isLoading && <LoadingState message="Carregando pacientes..." />}
      {patientsQuery.isError && <ErrorState message="Erro ao carregar pacientes." />}

      {!patientsQuery.isLoading && !patientsQuery.isError && (
        <Card>
          {items.length === 0 ? (
            <EmptyState message="Nenhum paciente encontrado." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 font-semibold">Nome</th>
                    <th className="p-2 font-semibold">Nascimento</th>
                    <th className="p-2 font-semibold">CPF</th>
                    <th className="p-2 font-semibold">Contato</th>
                    <th className="p-2 font-semibold">Convenio</th>
                    <th className="p-2 font-semibold">Ativo</th>
                    <th className="p-2 font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((patient) => (
                    <tr key={patient.id} className="border-b last:border-b-0">
                      <td className="p-2 font-medium text-slate-800">
                        {patient.full_name}
                        {patient.preferred_name ? (
                          <p className="text-xs text-slate-500">Nome social: {patient.preferred_name}</p>
                        ) : null}
                      </td>
                      <td className="p-2">{formatDate(patient.birth_date)}</td>
                      <td className="p-2">{patient.cpf ?? "-"}</td>
                      <td className="p-2">{patient.phone ?? patient.email ?? "-"}</td>
                      <td className="p-2">
                        {patient.insurance_provider
                          ? `${patient.insurance_provider}${patient.insurance_plan ? ` - ${patient.insurance_plan}` : ""}`
                          : "-"}
                      </td>
                      <td className="p-2">{patient.active ? "Sim" : "Nao"}</td>
                      <td className="p-2">
                        {!canUpdate && !canDelete && !canViewExams ? (
                          <span className="text-slate-400">-</span>
                        ) : (
                          <div className="flex gap-2">
                            {canUpdate && (
                              <Button variant="outline" onClick={() => onEdit(patient)}>
                                Editar
                              </Button>
                            )}
                            {canViewExams && (
                              <Link to={`/patients/${patient.id}`}>
                                <Button variant="outline">Exames</Button>
                              </Link>
                            )}
                            {canDelete && (
                              <Button
                                variant="danger"
                                onClick={() => {
                                  if (window.confirm("Deseja remover este paciente?")) {
                                    deleteMutation.mutate(patient.id);
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
        onClose={() => setOpenModal(false)}
        title={editingPatient ? "Editar paciente" : "Novo paciente"}
      >
        <form className="grid gap-3 md:grid-cols-2" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-semibold text-slate-700">Nome completo *</label>
            <Input {...form.register("full_name")} />
            {form.formState.errors.full_name && (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.full_name.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Nome social</label>
            <Input {...form.register("preferred_name")} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Data de nascimento</label>
            <Input type="date" {...form.register("birth_date")} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">CPF</label>
            <Input
              placeholder="000.000.000-00"
              {...form.register("cpf", {
                onChange: (event) => {
                  event.target.value = formatCpf(event.target.value);
                },
              })}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">RG</label>
            <Input
              {...form.register("rg", {
                onChange: (event) => {
                  event.target.value = normalizeRg(event.target.value);
                },
              })}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Telefone</label>
            <Input
              placeholder="(11) 9-1234-5678"
              {...form.register("phone", {
                onChange: (event) => {
                  event.target.value = formatPhone(event.target.value);
                },
              })}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">E-mail</label>
            <Input type="email" {...form.register("email")} />
            {form.formState.errors.email && (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.email.message}</p>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-semibold text-slate-700">Endereco</label>
            <Input {...form.register("address")} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Contato preferencial</label>
            <Select {...form.register("preferred_contact_method")}>
              <option value="">Nao informado</option>
              <option value="phone">Telefone</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">E-mail</option>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Ativo</label>
            <Select searchable={false} {...form.register("active")}>
              <option value="true">Sim</option>
              <option value="false">Nao</option>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Contato de emergencia</label>
            <Input {...form.register("emergency_contact_name")} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Telefone emergencia</label>
            <Input
              placeholder="(11) 9-1234-5678"
              {...form.register("emergency_contact_phone", {
                onChange: (event) => {
                  event.target.value = formatPhone(event.target.value);
                },
              })}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Convenio</label>
            <Input {...form.register("insurance_provider")} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Plano</label>
            <Input {...form.register("insurance_plan")} />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-semibold text-slate-700">Numero da carteirinha</label>
            <Input {...form.register("insurance_member_id")} />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-semibold text-slate-700">Alergias</label>
            <Textarea {...form.register("allergies")} />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-semibold text-slate-700">Historico medico</label>
            <Textarea {...form.register("medical_history")} />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-semibold text-slate-700">Observacoes gerais</label>
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
