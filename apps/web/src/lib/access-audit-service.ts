import { api } from "./api";

export const auditActions = {
  "clinical.record_read": "Consulta clínica autorizada — registro",
  "clinical.appointment_read": "Consulta clínica autorizada — agendamento",
  "clinical.patient_list": "Consulta clínica autorizada — histórico do paciente",
  "exam.download_prepared": "Download preparado",
} as const;
export type AuditAction = keyof typeof auditActions;
export interface AuditEvent {
  id: string; occurred_at: string; actor_id: string; action: AuditAction;
  patient_id: string | null; target_id: string;
  record_ids: string[]; record_versions: number[]; returned_count: number;
  page_limit: number | null; page_offset: number | null;
}
export interface AuditPage { items: AuditEvent[]; next_cursor: string | null }
export interface AuditFilters {
  action?: AuditAction; author_id?: string; patient_id?: string; target_id?: string;
  since?: string; until?: string;
}
export const accessAuditService = {
  async list(filters: AuditFilters, cursor: string | null, signal?: AbortSignal): Promise<AuditPage> {
    return (await api.get<AuditPage>("/api/access-audit", {
      params: { ...filters, limit: 25, ...(cursor ? { cursor } : {}) }, signal,
    })).data;
  },
};
