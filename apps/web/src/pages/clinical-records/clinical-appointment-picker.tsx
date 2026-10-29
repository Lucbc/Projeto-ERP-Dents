import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LiveQueryStatus } from "@/components/ui/live-query-status";
import { useLiveQuery } from "@/hooks/use-live-query";
import { appointmentService } from "@/lib/services";
import { formatDateTime } from "@/lib/datetime";
import { appointmentStatusLabels } from "@/lib/labels";
import type { ClinicalTarget } from "./clinical-editor";

export function ClinicalAppointmentPicker({ patientId, dentistId, onSelect }: {
  patientId: string; dentistId: string; onSelect: (target: ClinicalTarget) => void;
}) {
  const [selected, setSelected] = useState("");
  const query = useLiveQuery(["clinical-appointments", dentistId, patientId],
    signal => appointmentService.list({ patient_id: patientId, dentist_id: dentistId }, signal), { exactOnDenied: true, gcTime: 0 });
  const choices = query.data?.filter(item => item.patient_id === patientId && item.dentist_id === dentistId) ?? [];
  const visit = choices.find(item => item.id === selected);
  return <section aria-label="Selecionar consulta para atendimento" className="space-y-3 rounded-md border p-4">
    <h2 className="font-semibold">Registrar ou reabrir atendimento</h2>
    <LiveQueryStatus query={query} subject="consultas para atendimento" />
    <label className="block">Consulta vinculada
      <select className="mt-1 block w-full rounded-md border bg-background p-2" value={selected}
        disabled={query.accessDenied || query.isError || query.isFetching} onChange={event => setSelected(event.target.value)}>
        <option value="">Selecione a consulta</option>
        {choices.map(item => <option key={item.id} value={item.id}>
          {formatDateTime(item.start_at)} · {item.patient_name ?? "Paciente"} · {item.dentist_name ?? "Dentista"} · {appointmentStatusLabels[item.status]}
        </option>)}
      </select>
    </label>
    {query.data && !choices.length && <p>Nenhuma consulta encontrada para este paciente e seu vínculo de dentista.</p>}
    <Button disabled={!visit || query.isError || query.isFetching || query.accessDenied}
      onClick={() => visit && onSelect({ kind: "appointment", id: visit.id, appointment: visit })}>Abrir atendimento da consulta</Button>
  </section>;
}
