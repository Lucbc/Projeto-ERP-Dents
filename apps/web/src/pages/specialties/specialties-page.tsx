import { zodResolver } from "@hookform/resolvers/zod";
import { isAxiosError } from "axios";
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
import { useCatalogDeletion } from "@/hooks/use-catalog-deletion";
import { usePermissions } from "@/hooks/use-permissions";
import { getApiErrorMessage } from "@/lib/api";
import { specialtyService } from "@/lib/services";
import type { Specialty } from "@/types";

const specialtySchema = z.object({
  name: z.string().min(2, "Nome e obrigatorio."),
  active: z.enum(["true", "false"]),
});

type SpecialtyForm = z.infer<typeof specialtySchema>;

export function SpecialtiesPage() {
  const { toast } = useToast();
  const { can } = usePermissions();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [openModal, setOpenModal] = useState(false);
  const [editingSpecialty, setEditingSpecialty] = useState<Specialty | null>(null);
  const [editConflict, setEditConflict] = useState(false);

  const form = useForm<SpecialtyForm>({
    resolver: zodResolver(specialtySchema),
    defaultValues: {
      name: "",
      active: "true",
    },
  });

  const specialtiesQuery = useQuery({
    queryKey: ["specialties", search],
    queryFn: () => specialtyService.list({ search, limit: 100, offset: 0 }),
  });

  const createMutation = useMutation({
    mutationFn: (payload: SpecialtyForm) =>
      specialtyService.create({
        name: payload.name,
        active: payload.active === "true",
      }),
    onSuccess: () => {
      toast("Especialidade cadastrada com sucesso.");
      setOpenModal(false);
      form.reset();
      void queryClient.invalidateQueries({ queryKey: ["specialties"] });
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, version, payload }: { id: string; version: number; payload: SpecialtyForm }) =>
      specialtyService.update(id, {
        version,
        name: payload.name,
        active: payload.active === "true",
      }),
    onSuccess: () => {
      toast("Especialidade atualizada com sucesso.");
      setOpenModal(false);
      setEditingSpecialty(null);
      form.reset();
      void queryClient.invalidateQueries({ queryKey: ["specialties"] });
    },
    onError: (error) => {
      if (isAxiosError(error) && error.response?.status === 409
        && error.response.data?.code === "stale_version") setEditConflict(true);
      toast(getApiErrorMessage(error), "error");
    },
  });

  const reloadSpecialtyMutation = useMutation({
    mutationFn: (id: string) => specialtyService.get(id),
    onSuccess: (specialty) => {
      onEdit(specialty);
      void queryClient.invalidateQueries({ queryKey: ["specialties"] });
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const deletion = useCatalogDeletion(specialtyService.remove, () => specialtiesQuery.refetch(), () => {
    toast("Especialidade removida.");
    void queryClient.invalidateQueries({ queryKey: ["specialties"] });
  });

  const items = useMemo(() => specialtiesQuery.data?.items ?? [], [specialtiesQuery.data]);
  const isSubmitting = createMutation.isPending || updateMutation.isPending || reloadSpecialtyMutation.isPending;
  const canCreate = can("specialties", "create");
  const canUpdate = can("specialties", "update");
  const canDelete = can("specialties", "delete");

  const onNew = () => {
    if (!canCreate) return;
    setEditConflict(false);
    setEditingSpecialty(null);
    form.reset({
      name: "",
      active: "true",
    });
    setOpenModal(true);
  };

  const onEdit = (specialty: Specialty) => {
    if (!canUpdate) return;
    setEditConflict(false);
    setEditingSpecialty(specialty);
    form.reset({
      name: specialty.name,
      active: specialty.active ? "true" : "false",
    });
    setOpenModal(true);
  };

  const onSubmit = (values: SpecialtyForm) => {
    if (editingSpecialty) {
      updateMutation.mutate({ id: editingSpecialty.id, version: editingSpecialty.version, payload: values });
      return;
    }
    createMutation.mutate(values);
  };

  return (
    <div className="space-y-4">
      {deletion.review && <div role="alert" className="rounded border border-amber-300 p-3 space-y-2">
        <p>{deletion.review}</p>
        <p>Confira os dados atualizados e confirme novamente se ainda quiser excluir.</p>
        <Button disabled={deletion.reload.isPending} onClick={() => deletion.reload.mutate()}>Recarregar lista para conferir</Button>
      </div>}
      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-slate-800">Especialidades</h2>
            <p className="text-sm text-slate-500">Cadastre as especialidades atendidas na clinica.</p>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Buscar por nome"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="md:w-80"
            />
            {canCreate && <Button onClick={onNew}>Nova</Button>}
          </div>
        </div>
      </Card>

      {specialtiesQuery.isLoading && <LoadingState message="Carregando especialidades..." />}
      {specialtiesQuery.isError && <ErrorState message="Erro ao carregar especialidades." />}

      {!specialtiesQuery.isLoading && !specialtiesQuery.isError && (
        <Card>
          {items.length === 0 ? (
            <EmptyState message="Nenhuma especialidade encontrada." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 font-semibold">Nome</th>
                    <th className="p-2 font-semibold">Ativa</th>
                    <th className="p-2 font-semibold">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((specialty) => (
                    <tr key={specialty.id} className="border-b last:border-b-0">
                      <td className="p-2 font-medium text-slate-800">{specialty.name}</td>
                      <td className="p-2">{specialty.active ? "Sim" : "Nao"}</td>
                      <td className="p-2">
                        {!canUpdate && !canDelete ? (
                          <span className="text-slate-400">-</span>
                        ) : (
                          <div className="flex gap-2">
                            {canUpdate && (
                              <Button variant="outline" onClick={() => onEdit(specialty)}>
                                Editar
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                variant="danger"
                                disabled={deletion.blocked}
                                onClick={() => {
                                  const target = { id: specialty.id, version: specialty.version };
                                  if (window.confirm(`Excluir “${specialty.name}”?`)) {
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
        title={editingSpecialty ? "Editar especialidade" : "Nova especialidade"}
      >
        <form className="grid gap-3 md:grid-cols-2" onSubmit={form.handleSubmit(onSubmit)}>
          {editConflict && editingSpecialty && (
            <div role="alert" className="md:col-span-2 rounded border border-amber-300 bg-amber-50 p-3">
              <p>Esta especialidade foi alterada por outra operação. Seu rascunho permanece abaixo. Carregar o cadastro atual substituirá o nome e a ativação deste formulário.</p>
              <Button type="button" variant="outline" disabled={isSubmitting}
                onClick={() => reloadSpecialtyMutation.mutate(editingSpecialty.id)}>
                Descartar rascunho e carregar atual
              </Button>
            </div>
          )}
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-semibold text-slate-700">Nome *</label>
            <Input {...form.register("name")} />
            {form.formState.errors.name && (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Ativa</label>
            <Select searchable={false} {...form.register("active")}>
              <option value="true">Sim</option>
              <option value="false">Nao</option>
            </Select>
          </div>

          <div className="md:col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => setOpenModal(false)}>
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
