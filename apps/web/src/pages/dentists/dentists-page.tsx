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
import { useToast } from "@/components/ui/toast";
import { usePermissions } from "@/hooks/use-permissions";
import { getApiErrorMessage } from "@/lib/api";
import { dentistService } from "@/lib/services";
import type { Dentist } from "@/types";

const dentistSchema = z.object({
  full_name: z.string().min(2, "Nome completo é obrigatório."),
  cro: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("E-mail inválido.").or(z.literal("")).optional(),
  active: z.enum(["true", "false"]),
});

type DentistForm = z.infer<typeof dentistSchema>;

function nullable(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function DentistsPage() {
  const { toast } = useToast();
  const { can } = usePermissions();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [openModal, setOpenModal] = useState(false);
  const [editingDentist, setEditingDentist] = useState<Dentist | null>(null);

  const form = useForm<DentistForm>({
    resolver: zodResolver(dentistSchema),
    defaultValues: {
      full_name: "",
      cro: "",
      phone: "",
      email: "",
      active: "true",
    },
  });

  const dentistsQuery = useQuery({
    queryKey: ["dentists", search],
    queryFn: () => dentistService.list({ search, limit: 100, offset: 0 }),
  });

  const createMutation = useMutation({
    mutationFn: (payload: DentistForm) =>
      dentistService.create({
        full_name: payload.full_name,
        cro: nullable(payload.cro),
        phone: nullable(payload.phone),
        email: nullable(payload.email),
        active: payload.active === "true",
      }),
    onSuccess: () => {
      toast("Dentista cadastrado com sucesso.");
      setOpenModal(false);
      form.reset();
      void queryClient.invalidateQueries({ queryKey: ["dentists"] });
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: DentistForm }) =>
      dentistService.update(id, {
        full_name: payload.full_name,
        cro: nullable(payload.cro),
        phone: nullable(payload.phone),
        email: nullable(payload.email),
        active: payload.active === "true",
      }),
    onSuccess: () => {
      toast("Dentista atualizado com sucesso.");
      setOpenModal(false);
      setEditingDentist(null);
      form.reset();
      void queryClient.invalidateQueries({ queryKey: ["dentists"] });
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => dentistService.remove(id),
    onSuccess: () => {
      toast("Dentista removido.");
      void queryClient.invalidateQueries({ queryKey: ["dentists"] });
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const items = useMemo(() => dentistsQuery.data?.items ?? [], [dentistsQuery.data]);
  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const canCreate = can("dentists", "create");
  const canUpdate = can("dentists", "update");
  const canDelete = can("dentists", "delete");

  const onNew = () => {
    if (!canCreate) return;
    setEditingDentist(null);
    form.reset({
      full_name: "",
      cro: "",
      phone: "",
      email: "",
      active: "true",
    });
    setOpenModal(true);
  };

  const onEdit = (dentist: Dentist) => {
    if (!canUpdate) return;
    setEditingDentist(dentist);
    form.reset({
      full_name: dentist.full_name,
      cro: dentist.cro ?? "",
      phone: dentist.phone ?? "",
      email: dentist.email ?? "",
      active: dentist.active ? "true" : "false",
    });
    setOpenModal(true);
  };

  const onSubmit = (values: DentistForm) => {
    if (editingDentist) {
      updateMutation.mutate({ id: editingDentist.id, payload: values });
      return;
    }
    createMutation.mutate(values);
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-slate-800">Dentistas</h2>
            <p className="text-sm text-slate-500">Cadastro dos profissionais da clínica.</p>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Buscar por nome, CRO ou e-mail"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="md:w-80"
            />
            {canCreate && <Button onClick={onNew}>Novo</Button>}
          </div>
        </div>
      </Card>

      {dentistsQuery.isLoading && <LoadingState message="Carregando dentistas..." />}
      {dentistsQuery.isError && <ErrorState message="Erro ao carregar dentistas." />}

      {!dentistsQuery.isLoading && !dentistsQuery.isError && (
        <Card>
          {items.length === 0 ? (
            <EmptyState message="Nenhum dentista encontrado." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 font-semibold">Nome</th>
                    <th className="p-2 font-semibold">CRO</th>
                    <th className="p-2 font-semibold">Telefone</th>
                    <th className="p-2 font-semibold">E-mail</th>
                    <th className="p-2 font-semibold">Ativo</th>
                    <th className="p-2 font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((dentist) => (
                    <tr key={dentist.id} className="border-b last:border-b-0">
                      <td className="p-2 font-medium text-slate-800">{dentist.full_name}</td>
                      <td className="p-2">{dentist.cro ?? "-"}</td>
                      <td className="p-2">{dentist.phone ?? "-"}</td>
                      <td className="p-2">{dentist.email ?? "-"}</td>
                      <td className="p-2">{dentist.active ? "Sim" : "Não"}</td>
                      <td className="p-2">
                        {!canUpdate && !canDelete ? (
                          <span className="text-slate-400">-</span>
                        ) : (
                          <div className="flex gap-2">
                            {canUpdate && (
                              <Button variant="outline" onClick={() => onEdit(dentist)}>
                                Editar
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                variant="danger"
                                onClick={() => {
                                  if (window.confirm("Deseja remover este dentista?")) {
                                    deleteMutation.mutate(dentist.id);
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
        title={editingDentist ? "Editar dentista" : "Novo dentista"}
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
            <label className="mb-1 block text-sm font-semibold text-slate-700">CRO</label>
            <Input {...form.register("cro")} />
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

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Ativo</label>
            <Select {...form.register("active")}>
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </Select>
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
