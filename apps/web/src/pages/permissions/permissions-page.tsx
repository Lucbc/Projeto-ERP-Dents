import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";

import { useLiveQuery } from "@/hooks/use-live-query";
import { LiveQueryStatus } from "@/components/ui/live-query-status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { getApiErrorMessage } from "@/lib/api";
import {
  permissionActionLabels,
  permissionActions,
  permissionResourceLabels,
  permissionResources,
  userRoleLabels,
} from "@/lib/labels";
import { permissionService } from "@/lib/services";
import { cn } from "@/lib/utils";
import type { PermissionAction, PermissionActions, PermissionResource, UserRole } from "@/types";

const editableRoles: UserRole[] = ["coordinator", "dentist", "reception"];

type RoleMatrixDraft = Record<PermissionResource, PermissionActions>;
type RoleDraft = { permissions: RoleMatrixDraft; version: number; review: boolean; reloading: boolean };
type DraftState = Partial<Record<UserRole, RoleDraft>>;

function createEmptyActions(): PermissionActions {
  return { view: false, create: false, update: false, delete: false };
}

function createEmptyRoleMatrix(): RoleMatrixDraft {
  return permissionResources.reduce(
    (acc, resource) => {
      acc[resource] = createEmptyActions();
      return acc;
    },
    {} as RoleMatrixDraft,
  );
}

function normalizeRoleMatrix(rawPermissions: Record<string, PermissionActions> | undefined): RoleMatrixDraft {
  const base = createEmptyRoleMatrix();

  for (const resource of permissionResources) {
    const resourceActions = rawPermissions?.[resource];
    for (const action of permissionActions) {
      base[resource][action] = Boolean(resourceActions?.[action]);
    }
  }

  return base;
}

const rolesKey = ["permissions", "roles"];

export function PermissionsPage() {
  const client = useQueryClient();
  const [denied, setDenied] = useState(false);
  const onDenied = useCallback(() => setDenied(true), []);
  useEffect(() => {
    if (!denied) return;
    void client.cancelQueries({ queryKey: rolesKey, exact: true });
    client.removeQueries({ queryKey: rolesKey, exact: true });
  }, [denied, client]);
  if (denied) return <ErrorState message="Seu acesso à administração de permissões foi encerrado. Entre novamente." />;
  return <PermissionsContent onDenied={onDenied} />;
}

function PermissionsContent({ onDenied }: { onDenied: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<DraftState>({});
  const [savingRole, setSavingRole] = useState<UserRole | null>(null);
  const [openRole, setOpenRole] = useState<UserRole | null>(null);
  const active = useRef(true);
  const reloadControllers = useRef(new Set<AbortController>());
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      for (const controller of reloadControllers.current) controller.abort();
      reloadControllers.current.clear();
    };
  }, []);
  const permissionsQuery = useLiveQuery(rolesKey, signal => permissionService.list(signal), { exactOnDenied: true });
  const accessLost = permissionsQuery.accessDenied;

  useEffect(() => {
    const data = permissionsQuery.data;
    if (!data || accessLost) return;
    setDraft((previous) => {
      const next = { ...previous };
      for (const item of data.items) {
        if (editableRoles.includes(item.role) && !next[item.role]) {
          next[item.role] = { permissions: normalizeRoleMatrix(item.permissions), version: item.version,
            review: false, reloading: false };
        }
      }
      return next;
    });
  }, [permissionsQuery.data, accessLost]);

  const handleAccessLoss = (error: unknown) => {
    if (axios.isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0)) {
      active.current = false;
      onDenied();
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (accessLost) { active.current = false; onDenied(); }
  }, [accessLost, onDenied]);

  const updateMutation = useMutation({
    mutationFn: (payload: { role: UserRole; version: number; permissions: Record<string, PermissionActions> }) =>
      permissionService.update(payload.role, { version: payload.version, permissions: payload.permissions }),
    onMutate: (payload) => {
      setSavingRole(payload.role);
    },
    onSuccess: (saved, payload) => {
      if (!active.current) return;
      setDraft((previous) => ({ ...previous, [payload.role]: {
        permissions: normalizeRoleMatrix(saved.permissions), version: saved.version, review: false, reloading: false,
      } }));
      toast(`Permissões de ${userRoleLabels[payload.role]} atualizadas.`);
      void queryClient.invalidateQueries({ queryKey: ["permissions"] });
    },
    onError: (error, payload) => {
      if (!active.current) return;
      if (handleAccessLoss(error)) return;
      const response = axios.isAxiosError(error) ? error.response : undefined;
      if (!response || response.status >= 500 || response.data?.code === "stale_version") {
        setDraft((previous) => ({ ...previous, [payload.role]: { ...previous[payload.role]!, review: true } }));
      }
      toast(getApiErrorMessage(error), "error");
    },
    onSettled: () => setSavingRole(null),
  });

  const togglePermission = (
    role: UserRole,
    resource: PermissionResource,
    action: PermissionAction,
    checked: boolean,
  ) => {
    setDraft((prev) => ({
      ...prev,
      [role]: {
        ...prev[role]!,
        permissions: {
          ...prev[role]!.permissions,
          [resource]: { ...prev[role]!.permissions[resource], [action]: checked },
        },
      },
    }));
  };

  const saveRole = (role: UserRole) => {
    const roleDraft = draft[role];
    if (!roleDraft || roleDraft.review || roleDraft.reloading || updateMutation.isPending || accessLost) return;
    updateMutation.mutate({ role, permissions: roleDraft.permissions, version: roleDraft.version });
  };

  const reloadRole = async (role: UserRole) => {
    if (!draft[role] || draft[role]?.reloading || updateMutation.isPending) return;
    setDraft((previous) => ({ ...previous, [role]: { ...previous[role]!, review: true, reloading: true } }));
    const controller = new AbortController();
    reloadControllers.current.add(controller);
    try {
      const response = await permissionService.list(controller.signal);
      if (!active.current || controller.signal.aborted) return;
      const current = response.items.find((item) => item.role === role);
      if (!current) throw new Error("Perfil indisponível.");
      setDraft((previous) => ({ ...previous, [role]: { permissions: normalizeRoleMatrix(current.permissions),
        version: current.version, review: false, reloading: false } }));
      toast("Permissões atuais carregadas. Revise antes de salvar.");
    } catch (error) {
      if (!active.current || controller.signal.aborted) return;
      if (!handleAccessLoss(error)) {
        setDraft((previous) => ({ ...previous, [role]: { ...previous[role]!, reloading: false } }));
        toast(getApiErrorMessage(error), "error");
      }
    } finally {
      reloadControllers.current.delete(controller);
    }
  };

  const toggleRoleAccordion = (role: UserRole) => {
    setOpenRole((prev) => (prev === role ? null : role));
  };

  if (accessLost) return <ErrorState message="Seu acesso à administração de permissões foi encerrado. Entre novamente." />;

  const status = <LiveQueryStatus query={permissionsQuery} subject="permissões" />;

  if (permissionsQuery.isLoading) {
    return <>{status}<LoadingState message="Carregando permissões..." /></>;
  }

  if (permissionsQuery.isError && !permissionsQuery.data) {
    return status;
  }

  if (!permissionsQuery.data || permissionsQuery.data.items.length === 0) {
    return <>{status}{permissionsQuery.data && <EmptyState message="Nenhuma permissão cadastrada." />}</>;
  }

  return (
    <div className="space-y-4">
      {status}
      <Card>
        <h2 className="font-display text-xl font-semibold text-slate-800">Permissões por Perfil</h2>
        <p className="text-sm text-slate-500">
          O perfil Administrador sempre possui acesso total e não pode ser alterado.
        </p>
      </Card>

      <Card>
        <h3 className="font-semibold text-slate-800">{userRoleLabels.admin}</h3>
        <p className="mt-1 text-sm text-slate-600">Acesso total em todos os recursos.</p>
      </Card>

      {editableRoles.map((role) => {
        const state = draft[role];
        const roleDraft = state?.permissions ?? createEmptyRoleMatrix();
        const isOpen = openRole === role;
        const observed = permissionsQuery.data?.items.find(item => item.role === role);
        const remoteChanged = !!state && !!observed && observed.version > state.version;

        return (
          <Card key={role}>
            <button
              type="button"
              onClick={() => toggleRoleAccordion(role)}
              className="mb-3 flex w-full items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-left transition-colors hover:bg-slate-50"
            >
              <div>
                <h3 className="font-semibold text-slate-800">{userRoleLabels[role]}</h3>
                <p className="text-xs text-slate-500">
                  {isOpen ? "Clique para recolher as permissões." : "Clique para expandir as permissões."}
                </p>
              </div>
              <ChevronDown
                size={16}
                className={cn("text-slate-500 transition-transform", isOpen && "rotate-180")}
              />
            </button>

            {remoteChanged && <p role="status" className="mb-3 text-sm text-amber-700 dark:text-amber-300">
              {userRoleLabels[role]}: há uma versão mais recente. Seu rascunho foi mantido.
            </p>}
            {isOpen && (
              <>
                {(state?.review || remoteChanged) && (
                  <div role="alert" className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                    <p>{state?.review ? "Este perfil precisa de revisão. Seu rascunho foi mantido. Carregue as permissões atuais antes de salvar novamente." : "Carregue a versão atual para revisar as alterações deste perfil."}</p>
                    <Button variant="outline" onClick={() => void reloadRole(role)} disabled={state?.reloading || updateMutation.isPending}>
                      {state?.reloading ? "Carregando..." : "Descartar rascunho e carregar atual"}
                    </Button>
                  </div>
                )}
                <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-slate-500">Marque as ações permitidas para este perfil.</p>
                  <Button
                    onClick={() => saveRole(role)}
                    disabled={!state || state.review || state.reloading || updateMutation.isPending}
                  >
                    {savingRole === role ? "Salvando..." : "Salvar Permissões"}
                  </Button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="p-2 font-semibold">Recurso</th>
                        {permissionActions.map((action) => (
                          <th key={action} className="p-2 text-center font-semibold">
                            {permissionActionLabels[action]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {permissionResources.map((resource) => (
                        <tr key={resource} className="border-b last:border-b-0">
                          <td className="p-2 font-medium text-slate-800">
                            {permissionResourceLabels[resource]}
                          </td>
                          {permissionActions.map((action) => (
                            <td key={`${resource}-${action}`} className="p-2 text-center">
                              <input
                                type="checkbox"
                                aria-label={`${userRoleLabels[role]}: ${permissionResourceLabels[resource]} — ${permissionActionLabels[action]}`}
                                disabled={!state || state.reloading || savingRole === role}
                                checked={Boolean(roleDraft[resource][action])}
                                onChange={(event) =>
                                  togglePermission(role, resource, action, event.target.checked)
                                }
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}
