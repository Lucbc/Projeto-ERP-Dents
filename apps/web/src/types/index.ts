export type UserRole = "admin" | "coordinator" | "dentist" | "reception";
export type AppointmentStatus = "scheduled" | "confirmed" | "completed" | "cancelled";
export type FinancialEntryType = "income" | "expense";
export type FinancialEntryStatus = "pending" | "paid" | "cancelled";
export type PaymentMethod =
  | "cash"
  | "pix"
  | "credit_card"
  | "debit_card"
  | "bank_transfer"
  | "boleto"
  | "insurance"
  | "other";
export type PermissionAction = "view" | "create" | "update" | "delete";
export type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";
export type PermissionResource =
  | "dashboard"
  | "patients"
  | "dentists"
  | "specialties"
  | "procedures"
  | "appointments"
  | "calendar"
  | "exams"
  | "users"
  | "permissions"
  | "consultations"
  | "financial";

export interface PermissionActions {
  view: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}

export interface Patient {
  id: string;
  full_name: string;
  preferred_name: string | null;
  birth_date: string | null;
  cpf: string | null;
  rg: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  preferred_contact_method: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  insurance_provider: string | null;
  insurance_plan: string | null;
  insurance_member_id: string | null;
  allergies: string | null;
  medical_history: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Dentist {
  id: string;
  full_name: string;
  cro: string | null;
  phone: string | null;
  email: string | null;
  specialty: string | null;
  color: string | null;
  availability: DentistAvailabilitySlot[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DentistAvailabilitySlot {
  day_of_week: DayOfWeek;
  start_time: string;
  end_time: string;
}

export interface Procedure {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number | null;
  price_cents: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Specialty {
  id: string;
  name: string;
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
  procedure_ids: string[];
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

export interface FinancialEntry {
  id: string;
  entry_type: FinancialEntryType;
  description: string;
  amount_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  due_date: string;
  paid_at: string | null;
  status: FinancialEntryStatus;
  payment_method: PaymentMethod | null;
  patient_id: string | null;
  dentist_id: string | null;
  appointment_id: string | null;
  procedure_ids: string[];
  notes: string | null;
  patient_name?: string | null;
  dentist_name?: string | null;
  is_overdue: boolean;
  created_at: string;
  updated_at: string;
}

export interface FinancialSummary {
  income_total_cents: number;
  expense_total_cents: number;
  received_cents: number;
  paid_expense_cents: number;
  pending_income_cents: number;
  pending_expense_cents: number;
  overdue_income_cents: number;
  balance_cents: number;
  entries_count: number;
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
