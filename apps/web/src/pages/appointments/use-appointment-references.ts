import { useActionOptions } from "@/hooks/use-action-options";
import { usePermissions } from "@/hooks/use-permissions";
import { dentistService, procedureService } from "@/lib/services";
import { usePatientReferences } from "./use-patient-references";

const readDentists = (signal: AbortSignal) => dentistService.listAll({}, signal);
const readProcedures = (signal: AbortSignal) => procedureService.listAll({}, signal);

export function useAppointmentReferences(action: number | null, selectedPatient = "") {
  const { can } = usePermissions();
  const patients = usePatientReferences(action, selectedPatient, can("patients", "view"));
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
