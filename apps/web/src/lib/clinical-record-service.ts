import { api } from "@/lib/api";
import type { ClinicalRecordPage } from "@/types/clinical-records";

export const clinicalRecordService = {
  async list(patientId: string, offset: number, signal?: AbortSignal): Promise<ClinicalRecordPage> {
    return (await api.get<ClinicalRecordPage>("/api/clinical-records", {
      params: { patient_id: patientId, limit: 10, offset }, signal,
    })).data;
  },
};
