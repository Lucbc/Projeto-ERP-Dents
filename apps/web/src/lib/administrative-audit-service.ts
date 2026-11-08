import { api } from "./api";
import type { UserRole } from "@/types";

export const auditActions = {
  "user.created": "Usuário criado", "user.updated": "Usuário alterado",
  "user.password_reset": "Senha redefinida", "user.deleted": "Usuário excluído",
  "permissions.updated": "Permissões alteradas",
} as const;
export type AuditAction = keyof typeof auditActions;
export interface AuditEvent {
  id: string; occurred_at: string; actor_id: string; action: AuditAction;
  target_user_id: string | null; target_role: UserRole | null;
  before_version: number | null; after_version: number | null;
  changed_fields: string[];
  permission_changes: { resource: string; action: string; before: boolean; after: boolean }[];
}
export interface AuditPage { items: AuditEvent[]; next_cursor: string | null }
export interface AuditFilters {
  action?: AuditAction; author_id?: string; target_user_id?: string; target_role?: UserRole;
  since?: string; until?: string;
}
export const administrativeAuditService = {
  async list(filters: AuditFilters, cursor: string | null, signal?: AbortSignal): Promise<AuditPage> {
    return (await api.get<AuditPage>("/api/administrative-audit", {
      params: { ...filters, limit: 25, ...(cursor ? { cursor } : {}) }, signal,
    })).data;
  },
};
