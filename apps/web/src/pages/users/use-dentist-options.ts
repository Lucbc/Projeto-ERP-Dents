import { useActionOptions } from "@/hooks/use-action-options";
import { dentistService } from "@/lib/services";

const readDentists = (signal: AbortSignal) => dentistService.listAll({}, signal);
export function useDentistOptions(action: number | null, allowed: boolean) {
  return useActionOptions(action, allowed, readDentists);
}
