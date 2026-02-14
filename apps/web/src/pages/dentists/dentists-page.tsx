import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
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
import { dentistService, specialtyService } from "@/lib/services";
import type { DayOfWeek, Dentist, DentistAvailabilitySlot } from "@/types";

const dayOfWeekOptions: Array<{ value: DayOfWeek; label: string }> = [
  { value: "monday", label: "Segunda" },
  { value: "tuesday", label: "Terca" },
  { value: "wednesday", label: "Quarta" },
  { value: "thursday", label: "Quinta" },
  { value: "friday", label: "Sexta" },
  { value: "saturday", label: "Sabado" },
  { value: "sunday", label: "Domingo" },
];

const dayLabelByValue: Record<DayOfWeek, string> = dayOfWeekOptions.reduce(
  (acc, item) => ({ ...acc, [item.value]: item.label }),
  {} as Record<DayOfWeek, string>,
);

const availabilitySlotSchema = z
  .object({
    day_of_week: z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]),
    start_time: z.string().regex(/^\d{2}:\d{2}$/, "Horario inicial invalido."),
    end_time: z.string().regex(/^\d{2}:\d{2}$/, "Horario final invalido."),
  })
  .refine((slot) => slot.end_time > slot.start_time, {
    message: "Horario final deve ser maior que o inicial.",
    path: ["end_time"],
  });

const dentistSchema = z.object({
  full_name: z.string().min(2, "Nome completo e obrigatorio."),
  cro: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("E-mail invalido.").or(z.literal("")).optional(),
  specialty: z.string().optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Cor invalida. Use o padrao #RRGGBB.")
    .optional(),
  availability: z.array(availabilitySlotSchema),
  active: z.enum(["true", "false"]),
});

type DentistForm = z.infer<typeof dentistSchema>;

function nullable(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeColor(value?: string): string | null {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return null;
  return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : null;
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

function formatCro(value: string): string {
  const raw = value.trim();
  if (!raw) return "";

  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!cleaned) return "";

  const withoutPrefix = cleaned.replace(/^CRO/, "");
  const uf = withoutPrefix.replace(/[^A-Z]/g, "").slice(0, 2);
  const number = withoutPrefix.replace(/[^0-9]/g, "").slice(0, 6);

  let formatted = "CRO";
  if (uf) formatted += `-${uf}`;
  if (number) formatted += ` ${number}`;
  return formatted;
}

function normalizeTime(value?: string | null): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.length >= 5) return trimmed.slice(0, 5);
  return trimmed;
}

function normalizeAvailability(value: DentistAvailabilitySlot[] | null | undefined): DentistAvailabilitySlot[] {
  if (!value?.length) return [];

  return value
    .map((slot) => ({
      day_of_week: slot.day_of_week,
      start_time: normalizeTime(slot.start_time),
      end_time: normalizeTime(slot.end_time),
    }))
    .filter((slot) => slot.day_of_week && slot.start_time && slot.end_time);
}

function formatAvailability(slots: DentistAvailabilitySlot[] | null | undefined): string {
  if (!slots?.length) return "-";

  const normalized = normalizeAvailability(slots);
  if (!normalized.length) return "-";

  const preview = normalized.slice(0, 2).map((slot) => {
    const dayLabel = dayLabelByValue[slot.day_of_week] ?? slot.day_of_week;
    return `${dayLabel} ${slot.start_time}-${slot.end_time}`;
  });

  const suffix = normalized.length > 2 ? ` +${normalized.length - 2}` : "";
  return `${preview.join(" | ")}${suffix}`;
}

function createEmptyAvailabilitySlot(): DentistAvailabilitySlot {
  return {
    day_of_week: "monday",
    start_time: "08:00",
    end_time: "12:00",
  };
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
      specialty: "",
      color: "#0EA5A5",
      availability: [],
      active: "true",
    },
  });

  const { fields: availabilityFields, append, remove } = useFieldArray({
    control: form.control,
    name: "availability",
  });

  const dentistsQuery = useQuery({
    queryKey: ["dentists", search],
    queryFn: () => dentistService.list({ search, limit: 100, offset: 0 }),
  });

  const specialtiesQuery = useQuery({
    queryKey: ["specialties", "dentists-form"],
    queryFn: () => specialtyService.listAll(),
  });

  const createMutation = useMutation({
    mutationFn: (payload: DentistForm) =>
      dentistService.create({
        full_name: payload.full_name,
        cro: nullable(payload.cro),
        phone: nullable(payload.phone),
        email: nullable(payload.email),
        specialty: nullable(payload.specialty),
        color: normalizeColor(payload.color),
        availability: normalizeAvailability(payload.availability),
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
        specialty: nullable(payload.specialty),
        color: normalizeColor(payload.color),
        availability: normalizeAvailability(payload.availability),
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
  const specialties = useMemo(() => specialtiesQuery.data?.items ?? [], [specialtiesQuery.data]);
  const selectedSpecialty = form.watch("specialty");
  const specialtyOptions = useMemo(() => {
    const names = specialties.map((item) => item.name);
    if (selectedSpecialty && !names.includes(selectedSpecialty)) {
      return [...names, selectedSpecialty];
    }
    return names;
  }, [specialties, selectedSpecialty]);
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
      specialty: "",
      color: "#0EA5A5",
      availability: [],
      active: "true",
    });
    setOpenModal(true);
  };

  const onEdit = (dentist: Dentist) => {
    if (!canUpdate) return;
    setEditingDentist(dentist);
    form.reset({
      full_name: dentist.full_name,
      cro: formatCro(dentist.cro ?? ""),
      phone: formatPhone(dentist.phone ?? ""),
      email: dentist.email ?? "",
      specialty: dentist.specialty ?? "",
      color: dentist.color ?? "#0EA5A5",
      availability: normalizeAvailability(dentist.availability),
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
            <p className="text-sm text-slate-500">Cadastro dos profissionais da clinica.</p>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Buscar por nome, CRO, e-mail ou especialidade"
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
              <table className="w-full min-w-[1200px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 font-semibold">Nome</th>
                    <th className="p-2 font-semibold">Especialidade</th>
                    <th className="p-2 font-semibold">Cor</th>
                    <th className="p-2 font-semibold">CRO</th>
                    <th className="p-2 font-semibold">Telefone</th>
                    <th className="p-2 font-semibold">E-mail</th>
                    <th className="p-2 font-semibold">Disponibilidade</th>
                    <th className="p-2 font-semibold">Ativo</th>
                    <th className="p-2 font-semibold">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((dentist) => (
                    <tr key={dentist.id} className="border-b last:border-b-0">
                      <td className="p-2 font-medium text-slate-800">{dentist.full_name}</td>
                      <td className="p-2">{dentist.specialty ?? "-"}</td>
                      <td className="p-2">
                        {dentist.color ? (
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block h-4 w-4 rounded border border-slate-300"
                              style={{ backgroundColor: dentist.color }}
                            />
                            <span className="font-mono text-xs">{dentist.color}</span>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="p-2">{dentist.cro ?? "-"}</td>
                      <td className="p-2">{dentist.phone ?? "-"}</td>
                      <td className="p-2">{dentist.email ?? "-"}</td>
                      <td className="p-2">{formatAvailability(dentist.availability)}</td>
                      <td className="p-2">{dentist.active ? "Sim" : "Nao"}</td>
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
            <label className="mb-1 block text-sm font-semibold text-slate-700">Especialidade</label>
            <Select {...form.register("specialty")}>
              <option value="">Nao informada</option>
              {specialtyOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
            {!specialtiesQuery.isLoading && specialtyOptions.length === 0 && (
              <p className="mt-1 text-xs text-slate-500">
                Cadastre especialidades em Configuracoes para selecionar aqui.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">CRO</label>
            <Input
              placeholder="CRO-SP 123456"
              {...form.register("cro", {
                onChange: (event) => {
                  event.target.value = formatCro(event.target.value);
                },
              })}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Cor na agenda</label>
            <div className="flex items-center gap-2">
              <Input
                type="color"
                className="h-10 w-16 cursor-pointer p-1"
                {...form.register("color")}
              />
              <Input
                readOnly
                value={form.watch("color") ?? ""}
                className="font-mono text-xs"
              />
            </div>
            {form.formState.errors.color && (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.color.message}</p>
            )}
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

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Ativo</label>
            <Select searchable={false} {...form.register("active")}>
              <option value="true">Sim</option>
              <option value="false">Nao</option>
            </Select>
          </div>

          <div className="md:col-span-2 rounded-md border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-700">Disponibilidade na clinica</p>
                <p className="text-xs text-slate-500">Defina os dias e horarios de atendimento.</p>
              </div>
              <Button type="button" variant="outline" onClick={() => append(createEmptyAvailabilitySlot())}>
                Adicionar horario
              </Button>
            </div>

            {availabilityFields.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum horario cadastrado.</p>
            ) : (
              <div className="space-y-2">
                {availabilityFields.map((field, index) => (
                  <div key={field.id} className="grid gap-2 rounded-md border border-slate-200 p-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">Dia</label>
                      <Select {...form.register(`availability.${index}.day_of_week`)}>
                        {dayOfWeekOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">Inicio</label>
                      <Input type="time" {...form.register(`availability.${index}.start_time`)} />
                      {form.formState.errors.availability?.[index]?.start_time && (
                        <p className="mt-1 text-xs text-red-600">
                          {form.formState.errors.availability[index]?.start_time?.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">Fim</label>
                      <Input type="time" {...form.register(`availability.${index}.end_time`)} />
                      {form.formState.errors.availability?.[index]?.end_time && (
                        <p className="mt-1 text-xs text-red-600">
                          {form.formState.errors.availability[index]?.end_time?.message}
                        </p>
                      )}
                    </div>

                    <div className="self-end">
                      <Button type="button" variant="danger" className="px-3 py-2" onClick={() => remove(index)}>
                        Remover
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
