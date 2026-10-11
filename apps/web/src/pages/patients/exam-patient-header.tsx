import { useCallback, useContext, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useLiveQuery } from "@/hooks/use-live-query";
import { ReadSuspensionContext } from "@/hooks/read-suspension";
import { LiveQueryStatus } from "@/components/ui/live-query-status";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { patientService } from "@/lib/services";
import type { Patient } from "@/types";

export type ExamPatientIdentity = { data?: Patient; ready: boolean; denied: boolean; reload: () => Promise<boolean> };

/** Permission changes remount only this reader, preserving the separate upload draft. */
export function ExamPatientHeader({ patientId, enabled, onIdentity, onMissing }: {
  patientId: string; enabled: boolean; onIdentity: (value: ExamPatientIdentity | null) => void; onMissing: () => void;
}) {
  const client = useQueryClient();
  const suspended = useContext(ReadSuspensionContext);
  const query = useLiveQuery(["patient", patientId], signal => patientService.get(patientId, signal),
    { enabled, exactOnDenied: true });
  const denied = !enabled || query.accessDenied;
  const missing = axios.isAxiosError(query.error) && query.error.response?.status === 404;
  const reload = useCallback(async () => {
    if (!enabled || denied || suspended) return false;
    const result = await query.refetch({ cancelRefetch: false });
    return result.isSuccess && !!result.data;
  }, [enabled, denied, suspended, query.refetch]);
  useEffect(() => {
    onIdentity({ data: denied || missing ? undefined : query.data,
      ready: !!query.data && !query.isError && !denied && !missing, denied, reload });
  }, [query.data, query.isError, denied, missing, reload, onIdentity]);
  useEffect(() => () => onIdentity(null), [onIdentity]);
  useEffect(() => { if (missing) onMissing(); }, [missing, onMissing]);
  useEffect(() => {
    if (enabled) return;
    void client.cancelQueries({ queryKey: ["patient", patientId], exact: true });
    client.removeQueries({ queryKey: ["patient", patientId], exact: true });
  }, [enabled, patientId, client]);
  if (denied) return <ErrorState message="Sem acesso aos dados do paciente. Os exames têm permissão própria." />;
  if (missing) return <ErrorState message="Paciente não encontrado." />;
  return <div className="space-y-2">
    {query.isLoading && <LoadingState message="Carregando paciente..." />}
    {query.data && <p className="text-sm text-slate-500">{query.data.full_name} ({query.data.cpf ?? "sem CPF"})</p>}
    <LiveQueryStatus query={query} subject="dados do paciente" />
  </div>;
}
