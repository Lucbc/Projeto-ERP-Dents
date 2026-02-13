import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
      toast(`Permissões de ${userRoleLabels[payload.role]} atualizadas.`);
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

  if (permissionsQuery.isLoading) {
    return <LoadingState message="Carregando permissões..." />;
  }

  if (permissionsQuery.isError) {
    return <ErrorState message="Erro ao carregar permissões." />;
  }

  if (!permissionsQuery.data || permissionsQuery.data.items.length === 0) {
    return <EmptyState message="Nenhuma permissão cadastrada." />;
  }

  return (
    <div className="space-y-4">
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
        const roleDraft = draft[role] ?? createEmptyRoleMatrix();
        return (
          <Card key={role}>
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <h3 className="font-semibold text-slate-800">{userRoleLabels[role]}</h3>
              <Button
                onClick={() => saveRole(role)}
                disabled={savingRole === role || updateMutation.isPending}
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
                      <td className="p-2 font-medium text-slate-800">{permissionResourceLabels[resource]}</td>
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
          </Card>
        );
      })}
    </div>
  );
}
