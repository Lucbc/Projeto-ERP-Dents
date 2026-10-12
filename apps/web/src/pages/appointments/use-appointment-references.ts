import { useActionOptions } from "@/hooks/use-action-options";
import { usePermissions } from "@/hooks/use-permissions";
import { dentistService, patientService, procedureService } from "@/lib/services";

const readPatients = (signal: AbortSignal) => patientService.listAll({}, signal);
const readDentists = (signal: AbortSignal) => dentistService.listAll({}, signal);
const readProcedures = (signal: AbortSignal) => procedureService.listAll({}, signal);

export function useAppointmentReferences(action: number | null) {
  const { can } = usePermissions();
  const patients = useActionOptions(action, can("patients", "view"), readPatients);
  const dentists = useActionOptions(action, can("dentists", "view"), readDentists);
  const procedures = useActionOptions(action, can("procedures", "view"), readProcedures);
  const sources = [patients, dentists, procedures];
  return {
    patients, dentists, procedures,
    ready: sources.every(source => source.ready),
    loading: sources.some(source => source.status === "loading"),
    reload: async () => (await Promise.all(sources.map(source => source.reload()))).every(Boolean),
  };
}
