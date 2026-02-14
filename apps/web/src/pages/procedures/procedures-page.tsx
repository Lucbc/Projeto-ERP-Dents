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
import { procedureService } from "@/lib/services";
import type { Procedure } from "@/types";

const procedureSchema = z.object({
  name: z.string().min(2, "Nome e obrigatorio."),
  description: z.string().optional(),
  duration_minutes: z
    .string()
    .optional()
    .refine((value) => !value || /^\d+$/.test(value), "Duracao deve ser um numero inteiro."),
  price: z
    .string()
    .optional()
    .refine((value) => !value || /^\d+([.,]\d{1,2})?$/.test(value), "Valor invalido."),
  active: z.enum(["true", "false"]),
});

type ProcedureForm = z.infer<typeof procedureSchema>;

function nullable(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function parseOptionalInt(value?: string): number | null {
  if (!value || !value.trim()) return null;
  return Number.parseInt(value, 10);
}

function parsePriceToCents(value?: string): number | null {
  if (!value || !value.trim()) return null;
  const normalized = value.replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

function formatPrice(cents: number | null): string {
  if (cents === null || cents === undefined) return "-";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function toPriceInput(cents: number | null): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function ProceduresPage() {
  const { toast } = useToast();
  const { can } = usePermissions();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [openModal, setOpenModal] = useState(false);
  const [editingProcedure, setEditingProcedure] = useState<Procedure | null>(null);

  const form = useForm<ProcedureForm>({
    resolver: zodResolver(procedureSchema),
    defaultValues: {
      name: "",
      description: "",
      duration_minutes: "",
      price: "",
      active: "true",
    },
  });

  const proceduresQuery = useQuery({
    queryKey: ["procedures", search],
    queryFn: () => procedureService.list({ search, limit: 100, offset: 0 }),
  });

  const createMutation = useMutation({
    mutationFn: (payload: ProcedureForm) =>
      procedureService.create({
        name: payload.name,
        description: nullable(payload.description),
        duration_minutes: parseOptionalInt(payload.duration_minutes),
        price_cents: parsePriceToCents(payload.price),
        active: payload.active === "true",
      }),
    onSuccess: () => {
      toast("Procedimento cadastrado com sucesso.");
      setOpenModal(false);
      form.reset();
      void queryClient.invalidateQueries({ queryKey: ["procedures"] });
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ProcedureForm }) =>
      procedureService.update(id, {
        name: payload.name,
        description: nullable(payload.description),
        duration_minutes: parseOptionalInt(payload.duration_minutes),
        price_cents: parsePriceToCents(payload.price),
        active: payload.active === "true",
      }),
    onSuccess: () => {
      toast("Procedimento atualizado com sucesso.");
      setOpenModal(false);
      setEditingProcedure(null);
      form.reset();
      void queryClient.invalidateQueries({ queryKey: ["procedures"] });
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => procedureService.remove(id),
    onSuccess: () => {
      toast("Procedimento removido.");
      void queryClient.invalidateQueries({ queryKey: ["procedures"] });
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const items = useMemo(() => proceduresQuery.data?.items ?? [], [proceduresQuery.data]);
  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const canCreate = can("procedures", "create");
  const canUpdate = can("procedures", "update");
  const canDelete = can("procedures", "delete");

  const onNew = () => {
    if (!canCreate) return;
    setEditingProcedure(null);
    form.reset({
      name: "",
      description: "",
      duration_minutes: "",
      price: "",
      active: "true",
    });
    setOpenModal(true);
  };

  const onEdit = (procedure: Procedure) => {
    if (!canUpdate) return;
    setEditingProcedure(procedure);
    form.reset({
      name: procedure.name,
      description: procedure.description ?? "",
      duration_minutes:
        procedure.duration_minutes === null || procedure.duration_minutes === undefined
          ? ""
          : String(procedure.duration_minutes),
      price: toPriceInput(procedure.price_cents),
      active: procedure.active ? "true" : "false",
    });
    setOpenModal(true);
  };

  const onSubmit = (values: ProcedureForm) => {
    if (editingProcedure) {
      updateMutation.mutate({ id: editingProcedure.id, payload: values });
      return;
    }
    createMutation.mutate(values);
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-slate-800">Procedimentos</h2>
            <p className="text-sm text-slate-500">Cadastro dos procedimentos realizados na clinica.</p>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Buscar por nome ou descricao"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="md:w-80"
            />
            {canCreate && <Button onClick={onNew}>Novo</Button>}
          </div>
        </div>
      </Card>

      {proceduresQuery.isLoading && <LoadingState message="Carregando procedimentos..." />}
      {proceduresQuery.isError && <ErrorState message="Erro ao carregar procedimentos." />}

      {!proceduresQuery.isLoading && !proceduresQuery.isError && (
        <Card>
          {items.length === 0 ? (
            <EmptyState message="Nenhum procedimento encontrado." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 font-semibold">Nome</th>
                    <th className="p-2 font-semibold">Duracao</th>
                    <th className="p-2 font-semibold">Valor</th>
                    <th className="p-2 font-semibold">Ativo</th>
                    <th className="p-2 font-semibold">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((procedure) => (
                    <tr key={procedure.id} className="border-b last:border-b-0">
                      <td className="p-2 font-medium text-slate-800">{procedure.name}</td>
                      <td className="p-2">
                        {procedure.duration_minutes === null || procedure.duration_minutes === undefined
                          ? "-"
                          : `${procedure.duration_minutes} min`}
                      </td>
                      <td className="p-2">{formatPrice(procedure.price_cents)}</td>
                      <td className="p-2">{procedure.active ? "Sim" : "Nao"}</td>
                      <td className="p-2">
                        {!canUpdate && !canDelete ? (
                          <span className="text-slate-400">-</span>
                        ) : (
                          <div className="flex gap-2">
                            {canUpdate && (
                              <Button variant="outline" onClick={() => onEdit(procedure)}>
                                Editar
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                variant="danger"
                                onClick={() => {
                                  if (window.confirm("Deseja remover este procedimento?")) {
                                    deleteMutation.mutate(procedure.id);
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
        title={editingProcedure ? "Editar procedimento" : "Novo procedimento"}
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
            <label className="mb-1 block text-sm font-semibold text-slate-700">Duracao (min)</label>
            <Input type="number" min="0" step="1" {...form.register("duration_minutes")} />
            {form.formState.errors.duration_minutes && (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.duration_minutes.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Valor (R$)</label>
            <Input placeholder="0,00" {...form.register("price")} />
            {form.formState.errors.price && (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.price.message}</p>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-semibold text-slate-700">Descricao</label>
            <Textarea {...form.register("description")} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Ativo</label>
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
