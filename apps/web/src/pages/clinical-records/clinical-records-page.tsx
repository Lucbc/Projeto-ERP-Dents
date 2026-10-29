import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/states";
import { LiveQueryStatus } from "@/components/ui/live-query-status";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { useLiveQuery } from "@/hooks/use-live-query";
import { clinicalRecordService } from "@/lib/clinical-record-service";
import { patientService } from "@/lib/services";
import { formatDate, formatDateTime } from "@/lib/datetime";
import type { ClinicalRecord } from "@/types/clinical-records";
import { ClinicalContextView } from "./clinical-context";
import { ClinicalEditor, type ClinicalTarget } from "./clinical-editor";
import { ClinicalAppointmentPicker } from "./clinical-appointment-picker";

function RecordView({ record, onEdit }: { record: ClinicalRecord; onEdit?: () => void }) {
  return <article aria-label={`Evolução de ${record.author_name}`} className="space-y-3 rounded-md border p-4">
    <header>
      <h3 className="font-semibold">{record.finalized_at ? "Evolução finalizada" : "Rascunho — ainda não finalizado"}</h3>
      <p>Autor: {record.author_name}</p>
      <p className="text-sm">Registrada em {formatDateTime(record.created_at)} · Atualizada em {formatDateTime(record.updated_at)}</p>
      {record.finalized_at && <p className="text-sm">Finalizada em {formatDateTime(record.finalized_at)}</p>}
    </header>
    <p className="whitespace-pre-wrap break-words">{record.text || "Rascunho sem texto."}</p>
    {record.context && <ClinicalContextView context={record.context} title="Contexto registrado na finalização" />}
    {record.addenda.length > 0 && <section aria-label="Adendos" className="space-y-3">
      <h4 className="font-semibold">Adendos — correções posteriores</h4>
      {record.addenda.map(item => <div key={item.id} className="space-y-2 border-l-4 pl-3">
        <p className="text-sm">{item.author_name} · {formatDateTime(item.recorded_at)}</p>
        <p className="whitespace-pre-wrap break-words">Motivo: {item.reason}</p>
        <p className="whitespace-pre-wrap break-words">{item.text}</p>
      </div>)}
    </section>}
    {onEdit && <Button variant="outline" onClick={onEdit}>{record.finalized_at ? "Adicionar adendo" : "Editar rascunho"}</Button>}
  </article>;
}

function HistoryPage({ patientId, userId, offset, onDenied, setOffset, onEdit }: {
  patientId: string; userId: string; offset: number; onDenied: () => void; setOffset: (offset: number) => void; onEdit?: (target: ClinicalTarget) => void;
}) {
  const { user } = useAuth();
  const query = useLiveQuery(["clinical-records", userId, patientId, offset],
    signal => clinicalRecordService.list(patientId, offset, signal), { exactOnDenied: true, gcTime: 0 });
  useEffect(() => { if (query.accessDenied) onDenied(); }, [query.accessDenied, onDenied]);
  if (query.accessDenied) return <ErrorState message="Seu acesso ao prontuário foi encerrado." />;
  return <section aria-label="Evoluções clínicas" className="space-y-4">
    <h2 className="text-lg font-semibold">Evoluções clínicas</h2>
    <LiveQueryStatus query={query} subject="evoluções clínicas" />
    {query.data && <>
      <p className="text-sm">{query.data.total === 0 ? "Nenhuma evolução registrada para este paciente." :
        `Exibindo ${offset + (query.data.items.length ? 1 : 0)} a ${offset + query.data.items.length} de ${query.data.total} evoluções.`}</p>
      {query.data.items.map(record => <RecordView key={record.id} record={record}
        onEdit={onEdit && record.author_id === userId && record.dentist_id === user?.dentist_id
          ? () => onEdit({ kind: "record", id: record.id }) : undefined} />)}
    </>}
    <div className="flex gap-3">
      <Button variant="outline" disabled={offset === 0 || query.isFetching} onClick={() => setOffset(Math.max(0, offset - 10))}>Evoluções anteriores na lista</Button>
      <Button variant="outline" disabled={!query.data || offset + 10 >= query.data.total || query.isFetching} onClick={() => setOffset(offset + 10)}>Mais evoluções</Button>
    </div>
  </section>;
}

function PatientContext({ patientId, userId }: { patientId: string; userId: string }) {
  const query = useLiveQuery(["clinical-patient-context", userId, patientId],
    signal => patientService.get(patientId, signal), { exactOnDenied: true, gcTime: 0, stopOnNotFound: true });
  if (query.accessDenied) return <p role="alert">Sem acesso aos dados cadastrais. A leitura das evoluções possui permissão própria.</p>;
  if (query.notFound) return <p role="alert">Paciente não encontrado.</p>;
  return <>
    <LiveQueryStatus query={query} subject="contexto atual do paciente" />
    {query.data && <>
      <p className="font-semibold">{query.data.full_name} · Nascimento: {formatDate(query.data.birth_date)}</p>
      <ClinicalContextView title="Contexto atual do cadastro" context={query.data} />
    </>}
  </>;
}

function ClinicalReader({ patientId, userId }: { patientId: string; userId: string }) {
  const { can } = usePermissions();
  const { user } = useAuth();
  const client = useQueryClient();
  const [denied, setDenied] = useState(false);
  const [offset, setOffset] = useState(0);
  const [target, setTarget] = useState<ClinicalTarget | null>(null);
  const author = user?.role === "dentist" && !!user.dentist_id;
  const onDenied = useCallback(() => setDenied(true), []);
  useEffect(() => () => {
    for (const key of ["clinical-records", "clinical-patient-context"]) {
      void client.cancelQueries({ queryKey: [key, userId, patientId] });
      client.removeQueries({ queryKey: [key, userId, patientId] });
    }
  }, [client, patientId, userId]);
  useEffect(() => {
    if (!denied) return;
    void client.cancelQueries({ queryKey: ["clinical-records", userId, patientId] });
    client.removeQueries({ queryKey: ["clinical-records", userId, patientId] });
  }, [denied, client, userId, patientId]);
  if (denied) return <ErrorState message="Seu acesso ao prontuário foi encerrado. Reabra a página após revisar as permissões." />;
  return <div className="space-y-4">
    <Card><h1 className="text-xl font-semibold">Prontuário clínico</h1>
      <p className="text-sm">Histórico de evoluções e correções. Os textos finalizados são preservados.</p>
      {can("patients", "view") ? <PatientContext key={patientId} patientId={patientId} userId={userId} />
        : <p role="status">Sem acesso ao cadastro deste paciente. As evoluções e o contexto registrado na finalização seguem a permissão clínica.</p>}
    </Card>
    {target ? <ClinicalEditor key={`${userId}:${user?.dentist_id}:${target.kind}:${target.id}`} patientId={patientId} target={target}
      onClose={() => setTarget(null)} onDenied={onDenied} /> : <>
      {author && (can("clinical_records", "create") || can("clinical_records", "update")) && can("appointments", "view") &&
        <ClinicalAppointmentPicker patientId={patientId} dentistId={user!.dentist_id!} onSelect={setTarget} />}
      <HistoryPage key={offset} patientId={patientId} userId={userId} offset={offset} setOffset={setOffset} onDenied={onDenied}
        onEdit={author && can("clinical_records", "update") ? setTarget : undefined} />
    </>}
    {can("patients", "view") && <Link to="/patients" className="underline">Voltar aos pacientes</Link>}
  </div>;
}

export function ClinicalRecordsPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const { user } = useAuth();
  const { can } = usePermissions();
  if (!user || !can("clinical_records", "view")) return <ErrorState message="Sem permissão para acessar o prontuário." />;
  if (!patientId) return <ErrorState message="Paciente não informado." />;
  return <ClinicalReader key={`${user.id}:${patientId}`} patientId={patientId} userId={user.id} />;
}
