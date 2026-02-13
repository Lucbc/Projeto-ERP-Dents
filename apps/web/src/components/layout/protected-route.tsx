import type { PropsWithChildren } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import type { PermissionAction, PermissionResource, UserRole } from "@/types";

interface ProtectedRouteProps extends PropsWithChildren {
  adminOnly?: boolean;
  allowedRoles?: UserRole[];
  permission?: {
    resource: PermissionResource;
    action: PermissionAction;
  };
}

export function ProtectedRoute({
  children,
  adminOnly = false,
  allowedRoles,
  permission,
}: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const permissions = usePermissions();

  if (isLoading) {
    return <div className="p-8 text-sm text-slate-600">Carregando sessão...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && user.role !== "admin") {
    return <div className="p-8 text-sm text-slate-600">Sem permissão para acessar esta página.</div>;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <div className="p-8 text-sm text-slate-600">Sem permissão para acessar esta página.</div>;
  }

  if (permission && user.role !== "admin") {
    if (permissions.isLoading) {
      return <div className="p-8 text-sm text-slate-600">Carregando permissões...</div>;
    }

    if (permissions.isError) {
      return <div className="p-8 text-sm text-slate-600">Erro ao carregar permissões do usuário.</div>;
    }

    if (!permissions.can(permission.resource, permission.action)) {
      return <div className="p-8 text-sm text-slate-600">Sem permissão para acessar esta página.</div>;
    }
  }

  return children;
}
