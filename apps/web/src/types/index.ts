export type UserRole = "admin" | "receptionist" | "dentist";
export type AppointmentStatus = "scheduled" | "confirmed" | "completed" | "cancelled";

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
