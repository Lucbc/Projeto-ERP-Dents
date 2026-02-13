export type UserRole = "admin" | "coordinator" | "dentist" | "reception";
export type AppointmentStatus = "scheduled" | "confirmed" | "completed" | "cancelled";
export type PermissionAction = "view" | "create" | "update" | "delete";
export type PermissionResource =
  | "dashboard"
  | "patients"
  | "dentists"
  | "appointments"
  | "calendar"
  | "exams"
  | "users"
  | "permissions"
  | "consultations";

export interface PermissionActions {
  view: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}

export interface Patient {
  id: string;
  full_name: string;
  birth_date: string | null;
  cpf: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Dentist {
  id: string;
  full_name: string;
  cro: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  dentist_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: string;
  patient_id: string;
  dentist_id: string;
  start_at: string;
  end_at: string;
  status: AppointmentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  patient_name?: string | null;
  dentist_name?: string | null;
}

export interface Exam {
  id: string;
  patient_id: string;
  original_filename: string;
  stored_filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  notes: string | null;
}

export interface ListResponse<T> {
  items: T[];
  total: number;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface RolePermission {
  role: UserRole;
  permissions: Record<string, PermissionActions>;
}

export interface RolePermissionListResponse {
  items: RolePermission[];
}

export interface ConsultationPatientSummary {
  patient: Patient;
  next_appointment: Appointment | null;
}

export interface ConsultationPatientListResponse {
  items: ConsultationPatientSummary[];
  total: number;
}

export interface ConsultationPatientDetailResponse {
  patient: Patient;
  next_appointment: Appointment | null;
  upcoming_appointments: Appointment[];
}
