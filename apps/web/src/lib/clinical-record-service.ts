import { api } from "@/lib/api";
import type { ClinicalRecord, ClinicalRecordPage } from "@/types/clinical-records";

export type ClinicalAttempt =
  | { action: "create"; target: string; payload: { key: string; text: string; expected_patient_id: string; appointment_version: number } }
  | { action: "save"; target: string; payload: { key: string; version: number; text: string } }
  | { action: "finalize"; target: string; payload: { key: string; version: number } }
  | { action: "addendum"; target: string; payload: { key: string; version: number; text: string; reason: string } };

export const clinicalRecordService = {
  async get(id: string, signal?: AbortSignal): Promise<ClinicalRecord> {
    return (await api.get<ClinicalRecord>(`/api/clinical-records/${id}`, { signal })).data;
  },
  async forAppointment(id: string, signal?: AbortSignal): Promise<ClinicalRecord | null> {
    return (await api.get<ClinicalRecord | null>(`/api/clinical-records/from-appointment/${id}`, { signal })).data;
  },
  async execute(attempt: ClinicalAttempt): Promise<ClinicalRecord> {
    const { action, target, payload } = attempt;
    if (action === "create") return (await api.post<ClinicalRecord>(`/api/clinical-records/from-appointment/${target}`, payload)).data;
    if (action === "save") return (await api.put<ClinicalRecord>(`/api/clinical-records/${target}`, payload)).data;
    return (await api.post<ClinicalRecord>(`/api/clinical-records/${target}/${action === "finalize" ? "finalize" : "addenda"}`, payload)).data;
  },
  async list(patientId: string, offset: number, signal?: AbortSignal): Promise<ClinicalRecordPage> {
    return (await api.get<ClinicalRecordPage>("/api/clinical-records", {
      params: { patient_id: patientId, limit: 10, offset }, signal,
    })).data;
  },
};
