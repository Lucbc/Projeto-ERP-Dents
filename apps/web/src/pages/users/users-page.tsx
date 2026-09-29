import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useMemo, useState } from "react";
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
import { useAuth } from "@/hooks/use-auth";
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
    password: z.string().refine((value) => Array.from(value).length <= 128, "Máximo de 128 caracteres.").optional(),
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
    new_password: z.string().refine((value) => Array.from(value).length >= 8, "Mínimo de 8 caracteres.").refine((value) => Array.from(value).length <= 128, "Maximo de 128 caracteres."),
    confirm_password: z.string().refine((value) => Array.from(value).length >= 8, "Confirme a senha.").refine((value) => Array.from(value).length <= 128, "Maximo de 128 caracteres."),
  })
  .refine((value) => value.new_password === value.confirm_password, {
    message: "As senhas não coincidem.",
    path: ["confirm_password"],
  });

type UserForm = z.infer<typeof userSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

export function UsersPage() {
  const { user: currentUser, logout } = useAuth();
  const isAdmin = currentUser?.role === "admin";
  const { toast } = useToast();
  const { can } = usePermissions();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [openModal, setOpenModal] = useState(false);
  const [openPasswordModal, setOpenPasswordModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [review, setReview] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [accessLost, setAccessLost] = useState(false);

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
    enabled: !accessLost,
    queryFn: () => userService.list({ search, limit: 100, offset: 0 }),
  });

  const dentistsQuery = useQuery({
    queryKey: ["dentists", "users-form"],
    queryFn: () => dentistService.listAll(),
  });

  const createMutation = useMutation({
    gcTime: 0,
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
    onError: (error) => handleFailure(error),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UserForm }) =>
      userService.update(id, {
        version: editingUser!.version,
        name: payload.name,
        email: payload.email,
        role: payload.role as UserRole,
        dentist_id: payload.dentist_id ? payload.dentist_id : null,
        is_active: payload.is_active === "true",
      }),
    onSuccess: (updated) => {
      toast("Usuário atualizado com sucesso.");
      setOpenModal(false);
      setEditingUser(null);
      form.reset();
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      if (updated.id === currentUser?.id && (updated.role !== currentUser.role || updated.email !== currentUser.email || updated.dentist_id !== currentUser.dentist_id || !updated.is_active)) logout();
    },
    onError: (error) => handleFailure(error),
  });

  const deleteMutation = useMutation({
    mutationFn: (target: User) => userService.remove(target.id, target.version),
    onSuccess: (_result, deletedId) => {
      toast("Usuário removido.");
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      setDeletingUser(null);
      if (deletedId.id === currentUser?.id) logout();
    },
    onError: (error) => handleFailure(error),
  });

  const setPasswordMutation = useMutation({
    gcTime: 0,
    mutationFn: ({ id, new_password }: { id: string; new_password: string }) =>
      userService.setPassword(id, new_password, selectedUser!.version),
    onSuccess: () => {
      toast("Senha redefinida com sucesso.");
      setOpenPasswordModal(false);
      passwordForm.reset();
      setSelectedUser(null);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      if (selectedUser?.id === currentUser?.id) logout();
    },
    onError: (error) => handleFailure(error),
  });

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const busy = isSubmitting || deleteMutation.isPending || setPasswordMutation.isPending || reloading;
  const clearFlows = () => {
    setOpenModal(false); setOpenPasswordModal(false); setEditingUser(null); setSelectedUser(null);
    setDeletingUser(null); setReview(false); form.reset(); passwordForm.reset();
  };
  const closeFlows = () => { if (!busy) clearFlows(); };
  const handleFailure = (error: unknown) => {
    passwordForm.reset(); form.setValue("password", "");
    const response = axios.isAxiosError(error) ? error.response : undefined;
    if ([401, 403].includes(response?.status ?? 0)) {
      clearFlows(); setAccessLost(true); queryClient.removeQueries({ queryKey: ["users"] });
    } else if (response?.status === 404) {
      clearFlows(); void queryClient.invalidateQueries({ queryKey: ["users"] });
    } else if (!response || response.status >= 500 || response.data?.code === "stale_version") {
      if (editingUser || selectedUser || deletingUser) setReview(true);
      else { clearFlows(); void queryClient.invalidateQueries({ queryKey: ["users"] }); }
    }
    toast(getApiErrorMessage(error), "error");
  };
  useEffect(() => {
    if (axios.isAxiosError(usersQuery.error) && [401, 403].includes(usersQuery.error.response?.status ?? 0)) {
      clearFlows(); setAccessLost(true); queryClient.removeQueries({ queryKey: ["users"] });
    }
  }, [usersQuery.error]);
  useEffect(() => {
    if (!createMutation.isPending && createMutation.variables) createMutation.reset();
    if (!setPasswordMutation.isPending && setPasswordMutation.variables) setPasswordMutation.reset();
  }, [createMutation.isPending, setPasswordMutation.isPending]);
  const reloadTarget = async () => {
    const target = editingUser ?? selectedUser ?? deletingUser;
    if (!target || busy) return;
    setReloading(true); passwordForm.reset();
    try {
      const current = await userService.get(target.id);
      if (current.role === "admin" && !isAdmin) { clearFlows(); return; }
      if (editingUser) {
        const references = await dentistService.listAll();
        queryClient.setQueryData(["dentists", "users-form"], references);
        setEditingUser(current);
        form.reset({ name: current.name, email: current.email, role: current.role,
          dentist_id: current.dentist_id ?? "", is_active: current.is_active ? "true" : "false", password: "" });
      } else if (selectedUser) setSelectedUser(current);
      else setDeletingUser(current);
      setReview(false);
    } catch (error) { handleFailure(error); }
    finally { setReloading(false); }
  };
  const reviewNotice = review && <div role="alert" className="rounded border border-amber-300 bg-muted p-3 text-foreground">
    <p>Os dados precisam de revisão. Carregue o usuário atual antes de tentar novamente.</p>
    <Button type="button" variant="outline" disabled={busy} onClick={() => void reloadTarget()}>Descartar e carregar atual</Button>
  </div>;

  const users = useMemo(() => usersQuery.data?.items ?? [], [usersQuery.data]);
  const dentists = useMemo(() => dentistsQuery.data?.items ?? [], [dentistsQuery.data]);
  const canCreate = can("users", "create");
  const canUpdate = can("users", "update");
  const canDelete = can("users", "delete");

  const onNew = () => {
    if (!canCreate || busy || accessLost) return;
    setReview(false);
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
    if (!canUpdate || busy || accessLost || (user.role === "admin" && !isAdmin)) return;
    setReview(false);
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
    if (busy || review || accessLost) return;
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

  if (accessLost) return <ErrorState message="Seu acesso à administração de usuários foi encerrado. Entre novamente." />;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-slate-800">Usuários</h2>
            <p className="text-sm text-slate-500">Gerencie logins, perfis e status dos usuários.</p>
            <p className="mt-1 text-sm text-slate-500">
              {isAdmin
                ? "Mantenha pelo menos um administrador ativo. Para remover o último, cadastre ou ative outro antes."
                : "Contas de administrador só podem ser alteradas por outro administrador."}
            </p>
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
                        {user.role === "admin" && !isAdmin ? (
                          <span className="text-slate-400">Somente administrador</span>
                        ) : !canUpdate && !canDelete ? (
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
                                    if (busy) return;
                                    setReview(false);
                                    setSelectedUser(user);
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
                                  if (busy) return;
                                  setReview(false); setDeletingUser(user);
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
        onClose={closeFlows}
        title={editingUser ? "Editar usuário" : "Novo usuário"}
      >
        <form className="grid gap-3 md:grid-cols-2" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="md:col-span-2">{reviewNotice}</div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Nome *</label>
            <Input disabled={busy} {...form.register("name")} />
            {form.formState.errors.name && (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">E-mail *</label>
            <Input disabled={busy} type="email" {...form.register("email")} />
            {form.formState.errors.email && (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Perfil *</label>
            <Select disabled={busy} {...form.register("role")}>
              {userRoleOptions.filter((option) => isAdmin || option.value !== "admin").map((roleOption) => (
                <option key={roleOption.value} value={roleOption.value}>
                  {roleOption.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Dentista associado</label>
            <Select disabled={busy} {...form.register("dentist_id")}>
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
              <Input disabled={busy} type="password" {...form.register("password")} />
              {form.formState.errors.password && (
                <p className="mt-1 text-xs text-red-600">{form.formState.errors.password.message}</p>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Ativo</label>
            <Select disabled={busy} searchable={false} {...form.register("is_active")}>
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </Select>
          </div>

          <div className="md:col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closeFlows}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy || review}>
              {isSubmitting ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={openPasswordModal}
        onClose={closeFlows}
        title="Redefinir senha"
      >
        <p className="mb-3 text-sm text-muted-foreground">{selectedUser?.name} — {selectedUser?.email} — {selectedUser && userRoleLabels[selectedUser.role]}</p>
        {reviewNotice}
        <form
          className="space-y-3"
          onSubmit={passwordForm.handleSubmit((values) => {
            if (!selectedUser || busy || review || accessLost) return;
            setPasswordMutation.mutate({ id: selectedUser.id, new_password: values.new_password });
          })}
        >
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Nova senha</label>
            <Input disabled={busy} type="password" {...passwordForm.register("new_password")} />
            {passwordForm.formState.errors.new_password && (
              <p className="mt-1 text-xs text-red-600">
                {passwordForm.formState.errors.new_password.message}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Confirmar senha</label>
            <Input disabled={busy} type="password" {...passwordForm.register("confirm_password")} />
            {passwordForm.formState.errors.confirm_password && (
              <p className="mt-1 text-xs text-red-600">
                {passwordForm.formState.errors.confirm_password.message}
              </p>
            )}
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closeFlows}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy || review}>
              {setPasswordMutation.isPending ? "Salvando..." : "Salvar senha"}
            </Button>
          </div>
        </form>
      </Modal>
      <Modal open={Boolean(deletingUser)} onClose={closeFlows} title="Excluir usuário">
        <p className="mb-3 text-sm text-muted-foreground">{deletingUser?.name} — {deletingUser?.email} — {deletingUser && userRoleLabels[deletingUser.role]}</p>
        <p>A conta e suas sessões serão removidas. O histórico financeiro será preservado.</p>
        {reviewNotice}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={closeFlows} disabled={busy}>Cancelar</Button>
          <Button variant="danger" disabled={busy || review} onClick={() => { if (deletingUser && !busy && !review) deleteMutation.mutate(deletingUser); }}>Confirmar exclusão</Button>
        </div>
      </Modal>
    </div>
  );
}
