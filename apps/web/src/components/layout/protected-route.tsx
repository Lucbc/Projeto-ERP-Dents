import { useState, type PropsWithChildren } from "react";
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
  const resource = permission?.resource;
  const mask = resource ? ["create", "update", "delete"].reduce((bits, action, index) =>
    bits | (permissions.can(resource, action as PermissionAction) ? 1 << index : 0), 0)
    | (resource === "financial" && permissions.can("financial_reversals", "create") ? 8 : 0) : 0;
  const [review, setReview] = useState({ mask, required: 0 });
  if (mask !== review.mask) setReview({ mask,
    required: review.required | ((review.mask & mask) !== review.mask ? review.mask : 0) });

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

  if (!resource) return children;
  return <>
    {review.required !== 0 && <div role="status" className="relative z-50 mb-3 space-y-2 rounded border bg-card p-3 text-card-foreground">
      <p>Suas permissões de alteração mudaram. As ações estão suspensas; os rascunhos e resultados pendentes foram preservados. Aguarde a revisão do acesso antes de continuar.</p>
      <button className="rounded border px-3 py-2 disabled:opacity-50" disabled={(mask & review.required) !== review.required}
        onClick={() => setReview({ mask, required: 0 })}>Revisar e retomar ações</button>
    </div>}
    <fieldset className="min-w-0" disabled={review.required !== 0}
      onSubmitCapture={event => { if (review.required !== 0) { event.preventDefault(); event.stopPropagation(); } }}>{children}</fieldset>
  </>;
}
