import type {
  AppointmentStatus,
  FinancialEntryStatus,
  FinancialEntryType,
  PaymentMethod,
  PermissionAction,
  PermissionResource,
  UserRole,
} from "@/types";

export const userRoleLabels: Record<UserRole, string> = {
  admin: "Administrador",
  coordinator: "Coordenador",
  dentist: "Dentista",
  reception: "Recepcao",
};

export const userRoleOptions: Array<{ value: UserRole; label: string }> = [
  { value: "admin", label: "Administrador" },
  { value: "coordinator", label: "Coordenador" },
  { value: "dentist", label: "Dentista" },
  { value: "reception", label: "Recepcao" },
];

export const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  scheduled: "Agendada",
  confirmed: "Confirmada",
  completed: "Concluida",
  cancelled: "Cancelada",
};

export const appointmentStatusOptions: Array<{ value: AppointmentStatus; label: string }> = [
  { value: "scheduled", label: "Agendada" },
  { value: "confirmed", label: "Confirmada" },
  { value: "completed", label: "Concluida" },
  { value: "cancelled", label: "Cancelada" },
];

export const financialEntryTypeLabels: Record<FinancialEntryType, string> = {
  income: "Receita",
  expense: "Despesa",
};

export const financialEntryTypeOptions: Array<{ value: FinancialEntryType; label: string }> = [
  { value: "income", label: "Receita" },
  { value: "expense", label: "Despesa" },
];

export const financialEntryStatusLabels: Record<FinancialEntryStatus, string> = {
  pending: "Pendente",
  paid: "Pago",
  cancelled: "Cancelado",
};

export const financialEntryStatusOptions: Array<{ value: FinancialEntryStatus; label: string }> = [
  { value: "pending", label: "Pendente" },
  { value: "paid", label: "Pago" },
  { value: "cancelled", label: "Cancelado" },
];

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  credit_card: "Cartao de credito",
  debit_card: "Cartao de debito",
  bank_transfer: "Transferencia",
  boleto: "Boleto",
  insurance: "Convenio",
  other: "Outro",
};

export const paymentMethodOptions: Array<{ value: PaymentMethod; label: string }> = [
  { value: "cash", label: "Dinheiro" },
  { value: "pix", label: "Pix" },
  { value: "credit_card", label: "Cartao de credito" },
  { value: "debit_card", label: "Cartao de debito" },
  { value: "bank_transfer", label: "Transferencia" },
  { value: "boleto", label: "Boleto" },
  { value: "insurance", label: "Convenio" },
  { value: "other", label: "Outro" },
];

export const permissionResources: PermissionResource[] = [
  "dashboard",
  "patients",
  "dentists",
  "specialties",
  "procedures",
  "appointments",
  "calendar",
  "exams",
  "users",
  "permissions",
  "consultations",
  "financial",
];

export const permissionActions: PermissionAction[] = ["view", "create", "update", "delete"];

export const permissionResourceLabels: Record<PermissionResource, string> = {
  dashboard: "Painel",
  patients: "Pacientes",
  dentists: "Dentistas",
  specialties: "Especialidades",
  procedures: "Procedimentos",
  appointments: "Consultas",
  calendar: "Agenda",
  exams: "Exames",
  users: "Usuarios",
  permissions: "Permissoes",
  consultations: "Consulta",
  financial: "Financeiro",
};

export const permissionActionLabels: Record<PermissionAction, string> = {
  view: "Ver",
  create: "Criar",
  update: "Editar",
  delete: "Excluir",
};
