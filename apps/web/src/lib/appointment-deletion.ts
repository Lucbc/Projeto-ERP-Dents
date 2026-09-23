import { isAxiosError } from "axios";
import { getApiErrorMessage } from "@/lib/api";
import type { Appointment } from "@/types";

export function appointmentDeletionConfirmation(appointment: Appointment, dirty = false): string {
  const when = new Date(appointment.start_at).toLocaleString("pt-BR");
  return `Excluir a consulta salva de ${appointment.patient_name ?? "Paciente"}, em ${when}?\nExcluir esta consulta não cancela cobranças nem pagamentos já registrados.`
    + (dirty ? "\nAs alterações do rascunho não serão aplicadas pela exclusão." : "");
}

export function appointmentDeletionError(error: unknown): string {
  if (!isAxiosError(error) || !error.response || error.response.status >= 500)
    return "Não foi possível confirmar a exclusão. Confira a consulta atual antes de excluir novamente.";
  if (error.response.status === 404)
    return "A consulta não está mais disponível. Você pode fechar esta janela e atualizar a agenda.";
  return getApiErrorMessage(error);
}
