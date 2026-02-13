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
import { userRoleLabels, userRoleOptions } from "@/lib/labels";
import { dentistService, userService } from "@/lib/services";
import type { User, UserRole } from "@/types";

const userSchema = z
  .object({
    name: z.string().min(2, "Nome obrigatório."),
    email: z.string().email("E-mail inválido."),
    role: z.enum(["admin", "coordinator", "dentist", "reception"]),
    dentist_id: z.string().optional(),
    is_active: z.enum(["true", "false"]),
    password: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (value.role === "dentist" && !value.dentist_id) {
      context.addIssue({
        code: "custom",
        path: ["dentist_id"],
        message: "Selecione o dentista associado para este perfil.",
      });
    }
  });

const passwordSchema = z
  .object({
    new_password: z.string().min(8, "Mínimo de 8 caracteres."),
    confirm_password: z.string().min(8, "Confirme a senha."),
  })
  .refine((value) => value.new_password === value.confirm_password, {
    message: "As senhas não coincidem.",
    path: ["confirm_password"],
  });

type UserForm = z.infer<typeof userSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

export function UsersPage() {
  const { toast } = useToast();
  const { can } = usePermissions();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [openModal, setOpenModal] = useState(false);
  const [openPasswordModal, setOpenPasswordModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const form = useForm<UserForm>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      name: "",
      email: "",
      role: "reception",
      dentist_id: "",
      is_active: "true",
      password: "",
    },
  });

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      new_password: "",
      confirm_password: "",
    },
  });

  const usersQuery = useQuery({
    queryKey: ["users", search],
    queryFn: () => userService.list({ search, limit: 100, offset: 0 }),
  });

  const dentistsQuery = useQuery({
    queryKey: ["dentists", "users-form"],
    queryFn: () => dentistService.list({ limit: 200, offset: 0 }),
  });

  const createMutation = useMutation({
    mutationFn: (payload: UserForm) =>
      userService.create({
        name: payload.name,
        email: payload.email,
        role: payload.role as UserRole,
        dentist_id: payload.dentist_id ? payload.dentist_id : null,
        password: payload.password!,
        is_active: payload.is_active === "true",
      }),
    onSuccess: () => {
      toast("Usuário cadastrado com sucesso.");
      setOpenModal(false);
      form.reset();
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UserForm }) =>
      userService.update(id, {
        name: payload.name,
        email: payload.email,
        role: payload.role as UserRole,
        dentist_id: payload.dentist_id ? payload.dentist_id : null,
        is_active: payload.is_active === "true",
      }),
    onSuccess: () => {
      toast("Usuário atualizado com sucesso.");
      setOpenModal(false);
      setEditingUser(null);
      form.reset();
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => userService.remove(id),
    onSuccess: () => {
      toast("Usuário removido.");
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const setPasswordMutation = useMutation({
    mutationFn: ({ id, new_password }: { id: string; new_password: string }) =>
      userService.setPassword(id, new_password),
    onSuccess: () => {
      toast("Senha redefinida com sucesso.");
      setOpenPasswordModal(false);
      passwordForm.reset();
      setSelectedUserId(null);
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const users = useMemo(() => usersQuery.data?.items ?? [], [usersQuery.data]);
  const dentists = useMemo(() => dentistsQuery.data?.items ?? [], [dentistsQuery.data]);
  const canCreate = can("users", "create");
  const canUpdate = can("users", "update");
  const canDelete = can("users", "delete");

  const onNew = () => {
    if (!canCreate) return;
    setEditingUser(null);
    form.reset({
      name: "",
      email: "",
      role: "reception",
      dentist_id: "",
      is_active: "true",
      password: "",
    });
    setOpenModal(true);
  };

  const onEdit = (user: User) => {
    if (!canUpdate) return;
    setEditingUser(user);
    form.reset({
      name: user.name,
      email: user.email,
      role: user.role,
      dentist_id: user.dentist_id ?? "",
      is_active: user.is_active ? "true" : "false",
      password: "",
    });
    setOpenModal(true);
  };

  const onSubmit = (values: UserForm) => {
    if (editingUser) {
      updateMutation.mutate({ id: editingUser.id, payload: values });
      return;
    }

    if (!values.password || values.password.length < 8) {
      form.setError("password", { message: "Senha com mínimo de 8 caracteres." });
      return;
    }

    createMutation.mutate(values);
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-slate-800">Usuários</h2>
            <p className="text-sm text-slate-500">Gerencie logins, perfis e status dos usuários.</p>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Buscar por nome ou e-mail"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="md:w-80"
            />
            {canCreate && <Button onClick={onNew}>Novo</Button>}
          </div>
        </div>
      </Card>

      {usersQuery.isLoading && <LoadingState message="Carregando usuários..." />}
      {usersQuery.isError && <ErrorState message="Erro ao carregar usuários." />}

      {!usersQuery.isLoading && !usersQuery.isError && (
        <Card>
          {users.length === 0 ? (
            <EmptyState message="Nenhum usuário encontrado." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 font-semibold">Nome</th>
                    <th className="p-2 font-semibold">E-mail</th>
                    <th className="p-2 font-semibold">Perfil</th>
                    <th className="p-2 font-semibold">Ativo</th>
                    <th className="p-2 font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b last:border-b-0">
                      <td className="p-2 font-medium text-slate-800">{user.name}</td>
                      <td className="p-2">{user.email}</td>
                      <td className="p-2">{userRoleLabels[user.role]}</td>
                      <td className="p-2">{user.is_active ? "Sim" : "Não"}</td>
                      <td className="p-2">
                        {!canUpdate && !canDelete ? (
                          <span className="text-slate-400">-</span>
                        ) : (
                          <div className="flex gap-2">
                            {canUpdate && (
                              <>
                                <Button variant="outline" onClick={() => onEdit(user)}>
                                  Editar
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedUserId(user.id);
                                    passwordForm.reset();
                                    setOpenPasswordModal(true);
                                  }}
                                >
                                  Senha
                                </Button>
                              </>
                            )}
                            {canDelete && (
                              <Button
                                variant="danger"
                                onClick={() => {
                                  if (window.confirm("Deseja remover este usuário?")) {
                                    deleteMutation.mutate(user.id);
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
        title={editingUser ? "Editar usuário" : "Novo usuário"}
      >
        <form className="grid gap-3 md:grid-cols-2" onSubmit={form.handleSubmit(onSubmit)}>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Nome *</label>
            <Input {...form.register("name")} />
            {form.formState.errors.name && (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">E-mail *</label>
            <Input type="email" {...form.register("email")} />
            {form.formState.errors.email && (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Perfil *</label>
            <Select {...form.register("role")}>
              {userRoleOptions.map((roleOption) => (
                <option key={roleOption.value} value={roleOption.value}>
                  {roleOption.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Dentista associado</label>
            <Select {...form.register("dentist_id")}>
              <option value="">Nenhum</option>
              {dentists.map((dentist) => (
                <option key={dentist.id} value={dentist.id}>
                  {dentist.full_name}
                </option>
              ))}
            </Select>
          </div>

          {!editingUser && (
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Senha *</label>
              <Input type="password" {...form.register("password")} />
              {form.formState.errors.password && (
                <p className="mt-1 text-xs text-red-600">{form.formState.errors.password.message}</p>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Ativo</label>
            <Select {...form.register("is_active")}>
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

      <Modal
        open={openPasswordModal}
        onClose={() => setOpenPasswordModal(false)}
        title="Redefinir senha"
      >
        <form
          className="space-y-3"
          onSubmit={passwordForm.handleSubmit((values) => {
            if (!selectedUserId) return;
            setPasswordMutation.mutate({ id: selectedUserId, new_password: values.new_password });
          })}
        >
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Nova senha</label>
            <Input type="password" {...passwordForm.register("new_password")} />
            {passwordForm.formState.errors.new_password && (
              <p className="mt-1 text-xs text-red-600">
                {passwordForm.formState.errors.new_password.message}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Confirmar senha</label>
            <Input type="password" {...passwordForm.register("confirm_password")} />
            {passwordForm.formState.errors.confirm_password && (
              <p className="mt-1 text-xs text-red-600">
                {passwordForm.formState.errors.confirm_password.message}
              </p>
            )}
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpenPasswordModal(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={setPasswordMutation.isPending}>
              {setPasswordMutation.isPending ? "Salvando..." : "Salvar senha"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
