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
    mutationFn: ({ id, payload }: { id: string; payload: SpecialtyForm }) =>
      specialtyService.update(id, {
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
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => specialtyService.remove(id),
    onSuccess: () => {
      toast("Especialidade removida.");
      void queryClient.invalidateQueries({ queryKey: ["specialties"] });
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const items = useMemo(() => specialtiesQuery.data?.items ?? [], [specialtiesQuery.data]);
  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const canCreate = can("specialties", "create");
  const canUpdate = can("specialties", "update");
  const canDelete = can("specialties", "delete");

  const onNew = () => {
    if (!canCreate) return;
    setEditingSpecialty(null);
    form.reset({
      name: "",
      active: "true",
    });
    setOpenModal(true);
  };

  const onEdit = (specialty: Specialty) => {
    if (!canUpdate) return;
    setEditingSpecialty(specialty);
    form.reset({
      name: specialty.name,
      active: specialty.active ? "true" : "false",
    });
    setOpenModal(true);
  };

  const onSubmit = (values: SpecialtyForm) => {
    if (editingSpecialty) {
      updateMutation.mutate({ id: editingSpecialty.id, payload: values });
      return;
    }
    createMutation.mutate(values);
  };

  return (
    <div className="space-y-4">
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
                                onClick={() => {
                                  if (window.confirm("Deseja remover esta especialidade?")) {
                                    deleteMutation.mutate(specialty.id);
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
        title={editingSpecialty ? "Editar especialidade" : "Nova especialidade"}
      >
        <form className="grid gap-3 md:grid-cols-2" onSubmit={form.handleSubmit(onSubmit)}>
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
