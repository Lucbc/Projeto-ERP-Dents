import { useContext } from "react";
import { useActionOptions } from "@/hooks/use-action-options";
import { usePermissions } from "@/hooks/use-permissions";
import { ReadSuspensionContext } from "@/hooks/read-suspension";
import { appointmentService, dentistService, patientService } from "@/lib/services";

const readPatients = (signal: AbortSignal) => patientService.listAll({}, signal);
const readDentists = (signal: AbortSignal) => dentistService.listAll({}, signal);
export async function readFinancialAppointments(signal: AbortSignal) {
  const now = new Date();
  const from = new Date(now);
  const to = new Date(now);
  from.setMonth(from.getMonth() - 6);
  to.setMonth(to.getMonth() + 6);
  const items = await appointmentService.list({ from: from.toISOString(), to: to.toISOString() }, signal);
  return { items: items.filter(item => item.status !== "cancelled") };
}

export function useFinancialReferences(action: number | null, includeAppointments = true) {
  const { can } = usePermissions();
  const suspended = useContext(ReadSuspensionContext);
  const patients = useActionOptions(action, can("patients", "view"), readPatients);
  const dentists = useActionOptions(action, can("dentists", "view"), readDentists);
  const appointments = useActionOptions(includeAppointments ? action : null, can("appointments", "view"), readFinancialAppointments);
  const sources = includeAppointments ? [patients, dentists, appointments] : [patients, dentists];
  return {
    patients, dentists, appointments,
    ready: !suspended && sources.every(source => source.ready || source.status === "denied"),
    loading: sources.some(source => source.status === "loading"),
    reload: () => Promise.all(sources.map(source => source.reload())),
  };
}
