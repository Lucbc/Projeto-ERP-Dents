import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { useAuth } from "@/hooks/use-auth";
import { permissionService } from "@/lib/services";
import type { PermissionAction, PermissionResource } from "@/types";

export function usePermissions() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["permissions", "me", user?.id],
    queryFn: () => permissionService.me(),
    enabled: Boolean(user && user.role !== "admin"),
    staleTime: 30_000,
  });

  const can = useCallback(
    (resource: PermissionResource, action: PermissionAction): boolean => {
      if (!user) return false;
      if (user.role === "admin") return true;
      return Boolean(query.data?.permissions?.[resource]?.[action]);
    },
    [user, query.data],
  );

  return {
    ...query,
    permissions: query.data?.permissions ?? {},
    can,
  };
}
