import type {
  AppointmentStatus,
  PermissionAction,
  PermissionResource,
  UserRole,
} from "@/types";

export const userRoleLabels: Record<UserRole, string> = {
  admin: "Administrador",
  coordinator: "Coordenador",
  dentist: "Dentista",
  reception: "Recepção",
};

export const userRoleOptions: Array<{ value: UserRole; label: string }> = [
  { value: "admin", label: "Administrador" },
  { value: "coordinator", label: "Coordenador" },
  { value: "dentist", label: "Dentista" },
  { value: "reception", label: "Recepção" },
];

export const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  scheduled: "Agendada",
  confirmed: "Confirmada",
  completed: "Concluída",
  cancelled: "Cancelada",
};

export const appointmentStatusOptions: Array<{ value: AppointmentStatus; label: string }> = [
  { value: "scheduled", label: "Agendada" },
  { value: "confirmed", label: "Confirmada" },
  { value: "completed", label: "Concluída" },
  { value: "cancelled", label: "Cancelada" },
];

export const permissionResources: PermissionResource[] = [
  "dashboard",
  "patients",
  "dentists",
  "appointments",
  "calendar",
  "exams",
  "users",
  "permissions",
  "consultations",
];

export const permissionActions: PermissionAction[] = ["view", "create", "update", "delete"];

export const permissionResourceLabels: Record<PermissionResource, string> = {
  dashboard: "Painel",
  patients: "Pacientes",
  dentists: "Dentistas",
  appointments: "Consultas",
  calendar: "Agenda",
  exams: "Exames",
  users: "Usuários",
  permissions: "Permissões",
  consultations: "Consulta",
};

export const permissionActionLabels: Record<PermissionAction, string> = {
  view: "Ver",
  create: "Criar",
  update: "Editar",
  delete: "Excluir",
};
