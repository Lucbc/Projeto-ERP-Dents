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
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/datetime";
import { getApiErrorMessage } from "@/lib/api";
import { patientService } from "@/lib/services";
import type { Patient } from "@/types";

const patientSchema = z.object({
  full_name: z.string().min(2, "Nome completo é obrigatório."),
  birth_date: z.string().optional(),
  cpf: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("E-mail inválido.").or(z.literal("")).optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

type PatientForm = z.infer<typeof patientSchema>;

function nullable(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function PatientsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [openModal, setOpenModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);

  const form = useForm<PatientForm>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      full_name: "",
      birth_date: "",
      cpf: "",
      phone: "",
      email: "",
      address: "",
      notes: "",
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
        birth_date: payload.birth_date || null,
        cpf: nullable(payload.cpf),
        phone: nullable(payload.phone),
        email: nullable(payload.email),
        address: nullable(payload.address),
        notes: nullable(payload.notes),
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
        birth_date: payload.birth_date || null,
        cpf: nullable(payload.cpf),
        phone: nullable(payload.phone),
        email: nullable(payload.email),
        address: nullable(payload.address),
        notes: nullable(payload.notes),
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

  const items = useMemo(() => patientsQuery.data?.items ?? [], [patientsQuery.data]);

  const onNew = () => {
    setEditingPatient(null);
    form.reset({
      full_name: "",
      birth_date: "",
      cpf: "",
      phone: "",
      email: "",
      address: "",
      notes: "",
    });
    setOpenModal(true);
  };

  const onEdit = (patient: Patient) => {
    setEditingPatient(patient);
    form.reset({
      full_name: patient.full_name,
      birth_date: patient.birth_date ?? "",
      cpf: patient.cpf ?? "",
      phone: patient.phone ?? "",
      email: patient.email ?? "",
      address: patient.address ?? "",
      notes: patient.notes ?? "",
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
              placeholder="Buscar por nome, CPF ou e-mail"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="md:w-80"
            />
            <Button onClick={onNew}>Novo</Button>
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
              <table className="w-full min-w-[920px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 font-semibold">Nome</th>
                    <th className="p-2 font-semibold">Nascimento</th>
                    <th className="p-2 font-semibold">CPF</th>
                    <th className="p-2 font-semibold">Contato</th>
                    <th className="p-2 font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((patient) => (
                    <tr key={patient.id} className="border-b last:border-b-0">
                      <td className="p-2 font-medium text-slate-800">{patient.full_name}</td>
                      <td className="p-2">{formatDate(patient.birth_date)}</td>
                      <td className="p-2">{patient.cpf ?? "-"}</td>
                      <td className="p-2">{patient.phone ?? patient.email ?? "-"}</td>
                      <td className="p-2">
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={() => onEdit(patient)}>
                            Editar
                          </Button>
                          <Link to={`/patients/${patient.id}`}>
                            <Button variant="outline">Exames</Button>
                          </Link>
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
            <label className="mb-1 block text-sm font-semibold text-slate-700">Data de nascimento</label>
            <Input type="date" {...form.register("birth_date")} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">CPF</label>
            <Input {...form.register("cpf")} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Telefone</label>
            <Input {...form.register("phone")} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">E-mail</label>
            <Input type="email" {...form.register("email")} />
            {form.formState.errors.email && (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.email.message}</p>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-semibold text-slate-700">Endereço</label>
            <Input {...form.register("address")} />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-semibold text-slate-700">Observações</label>
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
