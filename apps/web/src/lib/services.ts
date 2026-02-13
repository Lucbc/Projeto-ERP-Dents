import { api } from "@/lib/api";
import type {
  Appointment,
  ConsultationPatientDetailResponse,
  ConsultationPatientListResponse,
  Dentist,
  Exam,
  ListResponse,
  Patient,
  PermissionActions,
  RolePermission,
  RolePermissionListResponse,
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

export interface ConsultationFilters extends PaginationParams {
  dentist_id?: string;
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
};

export const patientService = {
  async list(params: PaginationParams) {
    const response = await api.get<ListResponse<Patient>>("/api/patients", { params });
    return response.data;
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
  async get(id: string) {
    const response = await api.get<Dentist>(`/api/dentists/${id}`);
    return response.data;
  },
  async create(payload: Partial<Dentist>) {
    const response = await api.post<Dentist>("/api/dentists", payload);
    return response.data;
  },
  async update(id: string, payload: Partial<Dentist>) {
    const response = await api.put<Dentist>(`/api/dentists/${id}`, payload);
    return response.data;
  },
  async remove(id: string) {
    await api.delete(`/api/dentists/${id}`);
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
  async create(payload: {
    patient_id: string;
    dentist_id: string;
    start_at: string;
    end_at: string;
    status: string;
    notes?: string | null;
  }) {
    const response = await api.post<Appointment>("/api/appointments", payload);
    return response.data;
  },
  async update(
    id: string,
    payload: {
      patient_id?: string;
      dentist_id?: string;
      start_at?: string;
      end_at?: string;
      status?: string;
      notes?: string | null;
    },
  ) {
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
