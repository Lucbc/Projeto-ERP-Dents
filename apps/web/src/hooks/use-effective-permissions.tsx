import { createContext, useContext, type PropsWithChildren } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLiveQuery } from "@/hooks/use-live-query";
import { permissionService } from "@/lib/services";
import type { PermissionAction, PermissionResource, RolePermission, User } from "@/types";

export type AccessStatus = "anonymous" | "checking" | "verified" | "unavailable" | "denied" | "identity-mismatch";
export interface EffectivePermissions {
  status: AccessStatus;
  permissions: RolePermission["permissions"];
  version: number | null;
  online: boolean;
  isFetching: boolean;
  dataUpdatedAt: number;
  refresh: () => void;
  can: (resource: PermissionResource, action: PermissionAction) => boolean;
}

const anonymous: EffectivePermissions = {
  status: "anonymous", permissions: {}, version: null, online: true,
  isFetching: false, dataUpdatedAt: 0, refresh: () => {}, can: () => false,
};
const Context = createContext<EffectivePermissions | null>(null);

function Reader({ user, children }: PropsWithChildren<{ user: User }>) {
  const query = useLiveQuery(["permissions", "me", user.id], signal => permissionService.me(signal),
    { exactOnDenied: true, gcTime: 0 });
  const status: AccessStatus = query.accessDenied ? "denied"
    : query.isError ? "unavailable"
    : !query.data ? "checking"
    : query.data.role !== user.role ? "identity-mismatch" : "verified";
  // Never expose an old matrix as current authority after a failed verification.
  const data = status === "verified" ? query.data : undefined;
  const value: EffectivePermissions = {
    status, permissions: data?.permissions ?? {}, version: data?.version ?? null,
    online: query.online, isFetching: query.isFetching, dataUpdatedAt: query.dataUpdatedAt,
    refresh: query.refresh,
    can: (resource, action) => Boolean(data && (user.role === "admin" || data.permissions[resource]?.[action])),
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** Mount once inside the session's QueryClient, outside all resource guards.
 * Integration is deliberately deferred until guards preserve hidden drafts.
 * Consumers subscribe to context only; they never create query observers/timers.
 */
export function EffectivePermissionsProvider({ children }: PropsWithChildren) {
  const parent = useContext(Context);
  const { user } = useAuth();
  if (parent) throw new Error("EffectivePermissionsProvider must be mounted only once per session.");
  return user
    ? <Reader key={`${user.id}:${user.role}:${user.dentist_id ?? ""}`} user={user}>{children}</Reader>
    : <Context.Provider value={anonymous}>{children}</Context.Provider>;
}

export function useEffectivePermissions() {
  const value = useContext(Context);
  if (!value) throw new Error("useEffectivePermissions requires EffectivePermissionsProvider.");
  return value;
}
