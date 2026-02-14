import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
type DraftState = Partial<Record<UserRole, RoleMatrixDraft>>;

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

export function PermissionsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<DraftState>({});
  const [savingRole, setSavingRole] = useState<UserRole | null>(null);
  const [openRole, setOpenRole] = useState<UserRole | null>(null);

  const permissionsQuery = useQuery({
    queryKey: ["permissions", "roles"],
    queryFn: () => permissionService.list(),
  });

  const roleMap = useMemo(() => {
    const mapped: Partial<Record<UserRole, Record<string, PermissionActions>>> = {};
    for (const item of permissionsQuery.data?.items ?? []) {
      mapped[item.role] = item.permissions;
    }
    return mapped;
  }, [permissionsQuery.data]);

  useEffect(() => {
    if (!permissionsQuery.data) return;

    const nextDraft: DraftState = {};
    for (const role of editableRoles) {
      nextDraft[role] = normalizeRoleMatrix(roleMap[role]);
    }
    setDraft(nextDraft);
  }, [permissionsQuery.data, roleMap]);

  const updateMutation = useMutation({
    mutationFn: (payload: { role: UserRole; permissions: Record<string, PermissionActions> }) =>
      permissionService.update(payload.role, { permissions: payload.permissions }),
    onMutate: (payload) => {
      setSavingRole(payload.role);
    },
    onSuccess: (_, payload) => {
      toast(`PermissÃµes de ${userRoleLabels[payload.role]} atualizadas.`);
      void queryClient.invalidateQueries({ queryKey: ["permissions"] });
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
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
        ...createEmptyRoleMatrix(),
        ...(prev[role] ?? createEmptyRoleMatrix()),
        [resource]: {
          ...(prev[role]?.[resource] ?? createEmptyActions()),
          [action]: checked,
        },
      },
    }));
  };

  const saveRole = (role: UserRole) => {
    const roleDraft = draft[role];
    if (!roleDraft) return;
    updateMutation.mutate({ role, permissions: roleDraft });
  };

  const toggleRoleAccordion = (role: UserRole) => {
    setOpenRole((prev) => (prev === role ? null : role));
  };

  if (permissionsQuery.isLoading) {
    return <LoadingState message="Carregando permissÃµes..." />;
  }

  if (permissionsQuery.isError) {
    return <ErrorState message="Erro ao carregar permissÃµes." />;
  }

  if (!permissionsQuery.data || permissionsQuery.data.items.length === 0) {
    return <EmptyState message="Nenhuma permissÃ£o cadastrada." />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-display text-xl font-semibold text-slate-800">PermissÃµes por Perfil</h2>
        <p className="text-sm text-slate-500">
          O perfil Administrador sempre possui acesso total e nÃ£o pode ser alterado.
        </p>
      </Card>

      <Card>
        <h3 className="font-semibold text-slate-800">{userRoleLabels.admin}</h3>
        <p className="mt-1 text-sm text-slate-600">Acesso total em todos os recursos.</p>
      </Card>

      {editableRoles.map((role) => {
        const roleDraft = draft[role] ?? createEmptyRoleMatrix();
        const isOpen = openRole === role;

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
                  {isOpen ? "Clique para recolher as permissÃµes." : "Clique para expandir as permissÃµes."}
                </p>
              </div>
              <ChevronDown
                size={16}
                className={cn("text-slate-500 transition-transform", isOpen && "rotate-180")}
              />
            </button>

            {isOpen && (
              <>
                <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-slate-500">Marque as aÃ§Ãµes permitidas para este perfil.</p>
                  <Button
                    onClick={() => saveRole(role)}
                    disabled={savingRole === role || updateMutation.isPending}
                  >
                    {savingRole === role ? "Salvando..." : "Salvar PermissÃµes"}
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
