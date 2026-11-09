import { api } from "./api";

export const auditActions = { "patient.updated": "Cadastro de paciente alterado" } as const;
export type AuditAction = keyof typeof auditActions;
export interface AuditEvent {
  id: string; occurred_at: string; actor_id: string; action: AuditAction;
  patient_id: string;
  before_version: number; after_version: number;
  changed_fields: string[];
}
export interface AuditPage { items: AuditEvent[]; next_cursor: string | null }
export interface AuditFilters {
  action?: AuditAction; author_id?: string; patient_id?: string;
  since?: string; until?: string;
}
export const patientAuditService = {
  async list(filters: AuditFilters, cursor: string | null, signal?: AbortSignal): Promise<AuditPage> {
    return (await api.get<AuditPage>("/api/patient-audit", {
      params: { ...filters, limit: 25, ...(cursor ? { cursor } : {}) }, signal,
    })).data;
  },
};
