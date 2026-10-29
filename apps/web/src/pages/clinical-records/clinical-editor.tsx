import { useContext, useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import { createPortal } from "react-dom";
import { isAxiosError } from "axios";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { appointmentService } from "@/lib/services";
import { clinicalRecordService, type ClinicalAttempt } from "@/lib/clinical-record-service";
import { getApiErrorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import type { Appointment } from "@/types";
import type { ClinicalRecord } from "@/types/clinical-records";
import { ReadSuspensionContext } from "@/hooks/read-suspension";
import { ClinicalContextView } from "./clinical-context";

export type ClinicalTarget = { kind: "record"; id: string } | { kind: "appointment"; id: string; appointment: Appointment };

export function ClinicalEditor({ patientId, target, onClose, onDenied }: {
  patientId: string; target: ClinicalTarget; onClose: () => void; onDenied: () => void;
}) {
  const { user } = useAuth();
  const permissions = usePermissions();
  const suspended = useContext(ReadSuspensionContext);
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;
  const client = useQueryClient();
  const [record, setRecord] = useState<ClinicalRecord | null>(null);
  const [visit, setVisit] = useState<Appointment | null>(target.kind === "appointment" ? target.appointment : null);
  const [text, setText] = useState("");
  const [addition, setAddition] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<ClinicalAttempt | null>(null);
  const [confirmFinal, setConfirmFinal] = useState(false);
  const active = useRef(true);
  const lock = useRef(false);
  const dirty = text !== (record?.text ?? "") || !!addition || !!reason;
  const protectedWork = dirty || !!pending || busy;
  const blocker = useBlocker(protectedWork);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (protectedWork) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [protectedWork]);
  const author = !!user && user.role === "dentist" && !!user.dentist_id && (!record ||
    (record.author_id === user.id && record.dentist_id === user.dentist_id));
  const writable = author && permissions.can("clinical_records", record ? "update" : "create")
    && (!!record || permissions.can("appointments", "view"));

  function validate(value: ClinicalRecord | null) {
    if (value && (value.patient_id !== patientId || (target.kind === "appointment" && value.appointment_id !== target.id))) {
      throw new Error("O registro não corresponde ao paciente e à consulta selecionados.");
    }
    return value;
  }
  async function read(signal?: AbortSignal) {
    return validate(record ? await clinicalRecordService.get(record.id, signal) : target.kind === "record"
      ? await clinicalRecordService.get(target.id, signal) : await clinicalRecordService.forAppointment(target.id, signal));
  }
  function apply(value: ClinicalRecord | null) {
    setRecord(value); setText(value?.text ?? ""); setAddition(""); setReason(""); setReview(false); setConfirmFinal(false);
  }
  function readFailure(cause: unknown) {
    if (isAxiosError(cause) && [401, 403].includes(cause.response?.status ?? 0)) onDenied();
    else { setReview(true); setError(getApiErrorMessage(cause)); }
  }
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    void (async () => {
      try {
        const current = validate(target.kind === "record" ? await clinicalRecordService.get(target.id, controller.signal)
          : await clinicalRecordService.forAppointment(target.id, controller.signal));
        if (!active.current || controller.signal.aborted) return;
        apply(current);
        if (target.kind === "record" && current && permissions.can("appointments", "view")) {
          try {
            const appointment = await appointmentService.get(current.appointment_id, controller.signal);
            if (active.current && !controller.signal.aborted && appointment.patient_id === patientId) setVisit(appointment);
          } catch { /* Clinical identity remains authoritative; agenda access is independent. */ }
        }
      } catch (cause) { if (active.current && !controller.signal.aborted) readFailure(cause); }
      finally { if (active.current && !controller.signal.aborted) setLoading(false); }
    })();
    return () => { active.current = false; controller.abort(); };
    // The parent remounts this editor for every target and identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reload() {
    if (lock.current || pending) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const current = await read();
      if (!current && target.kind === "appointment") {
        const updated = await appointmentService.get(target.id);
        if (updated.patient_id !== patientId || updated.dentist_id !== user?.dentist_id) {
          if (active.current) setError("A consulta mudou de paciente ou dentista. Feche este atendimento e confira a agenda.");
          return;
        }
        if (active.current) setVisit(updated);
      }
      if (active.current) { apply(current); setNotice("Versão atual carregada. Revise antes de salvar."); }
    }
    catch (cause) { if (active.current) readFailure(cause); }
    finally { lock.current = false; if (active.current) setBusy(false); }
  }

  async function send(attempt: ClinicalAttempt, retry = false) {
    if (lock.current || !writable || suspendedRef.current || loading || (pending && !retry)) return;
    lock.current = true; setBusy(true); setPending(attempt); setError(""); setNotice(""); setConfirmFinal(false);
    let confirmed = false;
    try {
      const result = validate(await clinicalRecordService.execute(attempt))!;
      confirmed = true;
      if (!active.current) return;
      setPending(null); apply(result); setReview(true);
      if (suspendedRef.current) { setNotice("Operação confirmada. Confira a versão atual após a verificação de acesso."); return; }
      void client.invalidateQueries({ queryKey: ["clinical-records", user!.id, patientId] });
      // A replay can return an older receipt. Read current state before another write.
      const current = validate(await clinicalRecordService.get(result.id))!;
      if (!active.current) return;
      apply(current);
      setNotice(current.version > result.version ? "Operação confirmada. Há alterações posteriores; a versão atual foi carregada para revisão."
        : "Operação confirmada e versão atual conferida.");
    } catch (cause) {
      if (!active.current) return;
      const status = isAxiosError(cause) ? cause.response?.status : undefined;
      if (confirmed) { setReview(true); setError("Operação confirmada, mas não foi possível conferir a versão atual. Carregue a versão atual antes de continuar."); }
      else if (retry || !status || status >= 500) {
        setPending(attempt); setError("O resultado ainda não está confirmado. Recupere esta tentativa antes de fazer outra alteração.");
      } else {
        setPending(null); setError(getApiErrorMessage(cause));
        if (status === 409 || status === 401 || status === 403) setReview(true);
      }
      if (status === 401 || status === 403) {
        if (confirmed) onDenied();
        permissions.refresh();
      }
    } finally { lock.current = false; if (active.current) setBusy(false); }
  }
  function save() {
    if (!writable || review || pending || busy) return;
    const key = crypto.randomUUID();
    if (record) void send({ action: "save", target: record.id, payload: { key, version: record.version, text } });
    else if (target.kind === "appointment" && visit?.patient_id === patientId && visit.dentist_id === user?.dentist_id)
      void send({ action: "create", target: target.id, payload: { key, text, expected_patient_id: patientId, appointment_version: visit.version } });
  }
  const blocked = loading || busy || !!pending || review || !writable || suspended;
  function close() {
    if (busy || pending) return;
    if (!dirty || window.confirm("Descartar o texto não salvo e fechar este atendimento?")) onClose();
  }
  return <Card>
    <section aria-label="Escrita do atendimento" className="space-y-3">
      <h2 className="text-xl font-semibold">Atendimento clínico</h2>
      {visit && permissions.can("appointments", "view") ? <p>{visit.patient_name ?? "Paciente selecionado"} · {visit.dentist_name ?? "Dentista vinculado"} · Consulta em {formatDateTime(visit.start_at)}</p>
        : <p>Registro do paciente selecionado. Horário da consulta indisponível neste acesso.</p>}
      {record && <p>Autor: {record.author_name} · {record.finalized_at ? "Finalizado — correções por adendo" : "Rascunho"}</p>}
      {loading && <p role="status">Carregando atendimento...</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!loading && !writable && <p role="alert">A escrita exige a permissão correspondente e o dentista autor. Seu texto local foi preservado.</p>}
      {pending && <div className="space-y-2 rounded-md border border-amber-500 p-3">
        <p>Há uma tentativa aguardando confirmação. A recuperação usa exatamente os dados enviados.</p>
        <Button disabled={busy || !writable} onClick={() => void send(pending, true)}>Recuperar tentativa</Button>
      </div>}
      {review && !pending && <div className="space-y-2 rounded-md border p-3">
        <p>Confira seu texto local antes de carregar. Essa ação substitui o texto local pela versão do servidor.</p>
        <Button variant="outline" disabled={busy} onClick={() => void reload()}>Descartar texto local e carregar versão atual</Button>
      </div>}
      {!record?.finalized_at ? <>
        <label className="block">Evolução clínica
          <textarea className="mt-1 block min-h-48 w-full rounded-md border bg-background p-3" value={text} maxLength={50000}
            disabled={blocked} onChange={event => { setText(event.target.value); setConfirmFinal(false); }} />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button disabled={blocked || (!!record && !dirty)} onClick={save}>Salvar rascunho</Button>
          {record && <Button disabled={blocked || dirty || !record.text.trim()} onClick={() => setConfirmFinal(true)}>Finalizar evolução</Button>}
        </div>
        {dirty && record && <p>Salve o rascunho antes de finalizar.</p>}
        {confirmFinal && <div role="alert" className="space-y-2 rounded-md border p-3">
          <p>Finalizar o texto salvo? Depois, correções serão feitas por adendo. O contexto atual do cadastro será registrado.</p>
          <Button disabled={blocked || dirty} onClick={() => record && void send({ action: "finalize", target: record.id,
            payload: { key: crypto.randomUUID(), version: record.version } })}>Confirmar finalização</Button>
          <Button variant="outline" onClick={() => setConfirmFinal(false)}>Continuar no rascunho</Button>
        </div>}
      </> : <>
        <h3 className="font-semibold">Evolução original finalizada</h3>
        <p className="whitespace-pre-wrap break-words">{record.text}</p>
        {record.context && <ClinicalContextView title="Contexto registrado na finalização" context={record.context} />}
        {record.addenda.map(item => <div key={item.id} className="space-y-1 border-l-4 pl-3">
          <p>Adendo de {item.author_name} · {formatDateTime(item.recorded_at)}</p>
          <p className="whitespace-pre-wrap break-words">Motivo: {item.reason}</p>
          <p className="whitespace-pre-wrap break-words">{item.text}</p>
        </div>)}
        <label className="block">Texto do adendo<textarea className="mt-1 block min-h-32 w-full rounded-md border bg-background p-3"
          value={addition} maxLength={50000} disabled={blocked} onChange={event => setAddition(event.target.value)} /></label>
        <label className="block">Motivo do adendo<textarea className="mt-1 block w-full rounded-md border bg-background p-3"
          value={reason} maxLength={5000} disabled={blocked} onChange={event => setReason(event.target.value)} /></label>
        <Button disabled={blocked || !addition.trim() || !reason.trim()} onClick={() => void send({ action: "addendum", target: record.id,
          payload: { key: crypto.randomUUID(), version: record.version, text: addition, reason } })}>Registrar adendo</Button>
      </>}
      <Button variant="outline" disabled={busy || !!pending} onClick={close}>Fechar atendimento</Button>
      {blocker.state === "blocked" && createPortal(<div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4">
        <div role="alertdialog" aria-label="Sair do atendimento" aria-modal="true" className="max-w-lg space-y-3 rounded-md border bg-card p-4 text-card-foreground">
          <p>Há texto não salvo ou uma operação pendente neste atendimento.</p>
          <Button onClick={() => blocker.reset()}>Continuar no atendimento</Button>
          {!pending && !busy && <Button variant="outline" onClick={() => blocker.proceed()}>Descartar texto e sair</Button>}
        </div>
      </div>, document.body)}
    </section>
  </Card>;
}
