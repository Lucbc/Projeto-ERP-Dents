import { api } from "@/lib/api";
import type {
  Appointment,
  ConsultationPatientDetailResponse,
  ConsultationPatientListResponse,
  Dentist,
  DentistAvailabilitySlot,
  Exam,
  FinancialEntry,
  FinancialEntryStatus,
  FinancialEntryType,
  FinancialSummary,
  ListResponse,
  PaymentMethod,
  Patient,
  PermissionActions,
  Procedure,
  RolePermission,
  RolePermissionListResponse,
  Specialty,
  TokenResponse,
  User,
  UserRole,
} from "@/types";

export interface PaginationParams {
  search?: string;
  limit?: number;
  offset?: number;
}

export interface AppointmentFilters {
  from?: string;
  to?: string;
  dentist_id?: string;
  patient_id?: string;
}

export interface FinancialFilters extends PaginationParams {
  entry_type?: FinancialEntryType;
  status?: FinancialEntryStatus;
  from?: string;
  to?: string;
  patient_id?: string;
  dentist_id?: string;
  appointment_id?: string;
}

export interface AppointmentPayload {
  patient_id?: string;
  dentist_id?: string;
  procedure_ids?: string[];
  start_at?: string;
  end_at?: string;
  status?: string;
  notes?: string | null;
}

export interface ConsultationFilters extends PaginationParams {
  dentist_id?: string;
}

export interface DentistPayload {
  full_name?: string;
  cro?: string | null;
  phone?: string | null;
  email?: string | null;
  specialty?: string | null;
  color?: string | null;
  availability?: DentistAvailabilitySlot[];
  active?: boolean;
}

export interface ProcedurePayload {
  name?: string;
  description?: string | null;
  duration_minutes?: number | null;
  price_cents?: number | null;
  active?: boolean;
}

export interface SpecialtyPayload {
  name?: string;
  active?: boolean;
}

export interface FinancialPayload {
  entry_type?: FinancialEntryType;
  description?: string;
  amount_cents?: number;
  discount_cents?: number;
  tax_cents?: number;
  due_date?: string;
  paid_at?: string | null;
  status?: FinancialEntryStatus;
  payment_method?: PaymentMethod | null;
  patient_id?: string | null;
  dentist_id?: string | null;
  appointment_id?: string | null;
  procedure_ids?: string[];
  notes?: string | null;
}

export interface GenerateFromAppointmentPayload {
  due_date?: string | null;
  paid_at?: string | null;
  status?: FinancialEntryStatus;
  payment_method?: PaymentMethod | null;
  notes?: string | null;
}

export interface MarkFinancialAsPaidPayload {
  paid_at?: string | null;
  payment_method?: PaymentMethod | null;
}

const PAGE_SIZE = 200;

type ListAllParams = Omit<PaginationParams, "limit" | "offset">;

async function fetchAllPages<T>(
  fetchPage: (params: PaginationParams) => Promise<ListResponse<T>>,
  params: ListAllParams = {},
): Promise<ListResponse<T>> {
  const items: T[] = [];
  let offset = 0;
  let total = 0;

  while (true) {
    const page = await fetchPage({ ...params, limit: PAGE_SIZE, offset });
    items.push(...page.items);
    total = page.total;

    if (items.length >= total || page.items.length < PAGE_SIZE) {
      break;
    }

    offset += PAGE_SIZE;
  }

  return {
    items,
    total: Math.max(total, items.length),
  };
}

export const authService = {
  async needsBootstrap() {
    const response = await api.get<{ needsBootstrap: boolean }>("/api/auth/needs-bootstrap");
    return response.data;
  },
  async bootstrapAdmin(payload: { name: string; email: string; password: string }) {
    const response = await api.post<User>("/api/auth/bootstrap-admin", payload);
    return response.data;
  },
  async login(payload: { email: string; password: string }) {
    const response = await api.post<TokenResponse>("/api/auth/login", payload);
    return response.data;
  },
  async me() {
    const response = await api.get<User>("/api/auth/me");
    return response.data;
  },
  async changePassword(payload: { current_password: string; new_password: string }) {
    const response = await api.post<{ detail: string }>("/api/auth/change-password", payload);
    return response.data;
  },
};

export const patientService = {
  async list(params: PaginationParams) {
    const response = await api.get<ListResponse<Patient>>("/api/patients", { params });
    return response.data;
  },
  async listAll(params: ListAllParams = {}) {
    return fetchAllPages<Patient>((nextParams) => patientService.list(nextParams), params);
  },
  async get(id: string) {
    const response = await api.get<Patient>(`/api/patients/${id}`);
    return response.data;
  },
  async create(payload: Partial<Patient>) {
    const response = await api.post<Patient>("/api/patients", payload);
    return response.data;
  },
  async update(id: string, payload: Partial<Patient>) {
    const response = await api.put<Patient>(`/api/patients/${id}`, payload);
    return response.data;
  },
  async remove(id: string) {
    await api.delete(`/api/patients/${id}`);
  },
};

export const dentistService = {
  async list(params: PaginationParams) {
    const response = await api.get<ListResponse<Dentist>>("/api/dentists", { params });
    return response.data;
  },
  async listAll(params: ListAllParams = {}) {
    return fetchAllPages<Dentist>((nextParams) => dentistService.list(nextParams), params);
  },
  async get(id: string) {
    const response = await api.get<Dentist>(`/api/dentists/${id}`);
    return response.data;
  },
  async create(payload: DentistPayload) {
    const response = await api.post<Dentist>("/api/dentists", payload);
    return response.data;
  },
  async update(id: string, payload: DentistPayload) {
    const response = await api.put<Dentist>(`/api/dentists/${id}`, payload);
    return response.data;
  },
  async remove(id: string) {
    await api.delete(`/api/dentists/${id}`);
  },
};

export const procedureService = {
  async list(params: PaginationParams) {
    const response = await api.get<ListResponse<Procedure>>("/api/procedures", { params });
    return response.data;
  },
  async listAll(params: ListAllParams = {}) {
    return fetchAllPages<Procedure>((nextParams) => procedureService.list(nextParams), params);
  },
  async get(id: string) {
    const response = await api.get<Procedure>(`/api/procedures/${id}`);
    return response.data;
  },
  async create(payload: ProcedurePayload) {
    const response = await api.post<Procedure>("/api/procedures", payload);
    return response.data;
  },
  async update(id: string, payload: ProcedurePayload) {
    const response = await api.put<Procedure>(`/api/procedures/${id}`, payload);
    return response.data;
  },
  async remove(id: string) {
    await api.delete(`/api/procedures/${id}`);
  },
};

export const specialtyService = {
  async list(params: PaginationParams) {
    const response = await api.get<ListResponse<Specialty>>("/api/specialties", { params });
    return response.data;
  },
  async listAll(params: ListAllParams = {}) {
    return fetchAllPages<Specialty>((nextParams) => specialtyService.list(nextParams), params);
  },
  async get(id: string) {
    const response = await api.get<Specialty>(`/api/specialties/${id}`);
    return response.data;
  },
  async create(payload: SpecialtyPayload) {
    const response = await api.post<Specialty>("/api/specialties", payload);
    return response.data;
  },
  async update(id: string, payload: SpecialtyPayload) {
    const response = await api.put<Specialty>(`/api/specialties/${id}`, payload);
    return response.data;
  },
  async remove(id: string) {
    await api.delete(`/api/specialties/${id}`);
  },
};

export const userService = {
  async list(params: PaginationParams) {
    const response = await api.get<ListResponse<User>>("/api/users", { params });
    return response.data;
  },
  async create(payload: {
    name: string;
    email: string;
    role: UserRole;
    dentist_id?: string | null;
    password: string;
    is_active: boolean;
  }) {
    const response = await api.post<User>("/api/users", payload);
    return response.data;
  },
  async update(
    id: string,
    payload: {
      name?: string;
      email?: string;
      role?: UserRole;
      dentist_id?: string | null;
      is_active?: boolean;
    },
  ) {
    const response = await api.put<User>(`/api/users/${id}`, payload);
    return response.data;
  },
  async setPassword(id: string, new_password: string) {
    const response = await api.post<User>(`/api/users/${id}/set-password`, { new_password });
    return response.data;
  },
  async remove(id: string) {
    await api.delete(`/api/users/${id}`);
  },
};

export const appointmentService = {
  async list(filters: AppointmentFilters) {
    const response = await api.get<Appointment[]>("/api/appointments", { params: filters });
    return response.data;
  },
  async get(id: string) {
    const response = await api.get<Appointment>(`/api/appointments/${id}`);
    return response.data;
  },
  async create(payload: AppointmentPayload) {
    const response = await api.post<Appointment>("/api/appointments", payload);
    return response.data;
  },
  async update(id: string, payload: AppointmentPayload) {
    const response = await api.put<Appointment>(`/api/appointments/${id}`, payload);
    return response.data;
  },
  async remove(id: string) {
    await api.delete(`/api/appointments/${id}`);
  },
};

export const permissionService = {
  async me() {
    const response = await api.get<RolePermission>("/api/permissions/me");
    return response.data;
  },
  async list() {
    const response = await api.get<RolePermissionListResponse>("/api/permissions");
    return response.data;
  },
  async update(role: UserRole, payload: { permissions: Record<string, PermissionActions> }) {
    const response = await api.put<RolePermission>(`/api/permissions/${role}`, payload);
    return response.data;
  },
};

export const consultationService = {
  async next(dentist_id?: string) {
    const response = await api.get<Appointment | null>("/api/consultations/next", {
      params: { dentist_id },
    });
    return response.data;
  },
  async listPatients(params: ConsultationFilters) {
    const response = await api.get<ConsultationPatientListResponse>("/api/consultations/patients", {
      params,
    });
    return response.data;
  },
  async getPatientDetail(patientId: string, dentist_id?: string) {
    const response = await api.get<ConsultationPatientDetailResponse>(
      `/api/consultations/patients/${patientId}`,
      { params: { dentist_id } },
    );
    return response.data;
  },
};

async function fetchExamBlob(examId: string): Promise<Blob> {
  const response = await api.get(`/api/exams/${examId}/download`, { responseType: "blob" });
  return response.data as Blob;
}

export const examService = {
  async listByPatient(patientId: string) {
    const response = await api.get<Exam[]>(`/api/patients/${patientId}/exams`);
    return response.data;
  },
  async upload(patientId: string, file: File, notes?: string) {
    const formData = new FormData();
    formData.append("file", file);
    if (notes) formData.append("notes", notes);

    const response = await api.post<Exam>(`/api/patients/${patientId}/exams`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },
  async download(examId: string, filename: string) {
    const blob = await fetchExamBlob(examId);
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.URL.revokeObjectURL(url);
  },
  async openInBrowser(examId: string) {
    const blob = await fetchExamBlob(examId);
    const url = window.URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => window.URL.revokeObjectURL(url), 4000);
  },
  async remove(examId: string) {
    await api.delete(`/api/exams/${examId}`);
  },
};

export const financialService = {
  async list(params: FinancialFilters) {
    const response = await api.get<ListResponse<FinancialEntry>>("/api/financial", { params });
    return response.data;
  },
  async summary(params: { from?: string; to?: string } = {}) {
    const response = await api.get<FinancialSummary>("/api/financial/summary", { params });
    return response.data;
  },
  async get(id: string) {
    const response = await api.get<FinancialEntry>(`/api/financial/${id}`);
    return response.data;
  },
  async create(payload: FinancialPayload) {
    const response = await api.post<FinancialEntry>("/api/financial", payload);
    return response.data;
  },
  async update(id: string, payload: FinancialPayload) {
    const response = await api.put<FinancialEntry>(`/api/financial/${id}`, payload);
    return response.data;
  },
  async generateFromAppointment(appointmentId: string, payload: GenerateFromAppointmentPayload) {
    const response = await api.post<FinancialEntry>(
      `/api/financial/from-appointment/${appointmentId}`,
      payload,
    );
    return response.data;
  },
  async markAsPaid(id: string, payload: MarkFinancialAsPaidPayload = {}) {
    const response = await api.post<FinancialEntry>(`/api/financial/${id}/mark-paid`, payload);
    return response.data;
  },
  async remove(id: string) {
    await api.delete(`/api/financial/${id}`);
  },
};
