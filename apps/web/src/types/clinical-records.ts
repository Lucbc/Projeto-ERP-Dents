export interface ClinicalContext {
  allergies: string | null;
  medical_history: string | null;
}

export interface ClinicalAddendum {
  id: string;
  author_id: string;
  author_name: string;
  dentist_id: string;
  text: string;
  reason: string;
  recorded_at: string;
}

export interface ClinicalRecord {
  id: string;
  appointment_id: string;
  patient_id: string;
  dentist_id: string;
  author_id: string;
  author_name: string;
  text: string;
  version: number;
  created_at: string;
  updated_at: string;
  finalized_at: string | null;
  context: ClinicalContext | null;
  addenda: ClinicalAddendum[];
}

export interface ClinicalRecordPage {
  items: ClinicalRecord[];
  total: number;
}
