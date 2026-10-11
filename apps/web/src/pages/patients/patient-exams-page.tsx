import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link, useParams } from "react-router-dom";
import { z } from "zod";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import axios from "axios";
import { Modal } from "@/components/ui/modal";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/datetime";
import { usePermissions } from "@/hooks/use-permissions";
import { getApiErrorMessage } from "@/lib/api";
import { examService } from "@/lib/services";
import { useLiveQuery } from "@/hooks/use-live-query";
import { ReadSuspensionContext } from "@/hooks/read-suspension";
import { LiveQueryStatus } from "@/components/ui/live-query-status";
import { ExamPatientHeader, type ExamPatientIdentity } from "./exam-patient-header";

const uploadSchema = z.object({
  file: z
    .any()
    .refine((value) => value && value.length > 0, "Selecione um arquivo para upload."),
  notes: z.string().max(2000, "Máximo de 2000 caracteres.").optional(),
});

type UploadForm = z.infer<typeof uploadSchema>;

export function PatientExamsPage() {
  const { patientId } = useParams<{ patientId: string }>();
  if (!patientId) return <ErrorState message="Paciente não informado." />;
  return <ExamsBoundary key={patientId} patientId={patientId} />;
}

type EndReason = "missing" | "denied";

function ExamsBoundary({ patientId }: { patientId: string }) {
  const client = useQueryClient();
  const [ended, setEnded] = useState<EndReason | null>(null);
  const onEnd = useCallback((reason: EndReason) => setEnded(reason), []);
  useEffect(() => {
    if (!ended) return;
    for (const queryKey of [["patient", patientId], ["exams", patientId]]) {
      void client.cancelQueries({ queryKey, exact: true });
      client.removeQueries({ queryKey, exact: true });
    }
  }, [ended, patientId, client]);
  if (ended) return <ErrorState message={ended === "missing" ? "Paciente não encontrado. As ações de exames foram encerradas."
    : "Seu acesso aos exames foi encerrado. Entre novamente após revisar o acesso."} />;
  return <PatientExamsContent patientId={patientId} onEnd={onEnd} />;
}

function PatientExamsContent({ patientId, onEnd }: { patientId: string; onEnd: (reason: EndReason) => void }) {
  const { toast } = useToast();
  const { can } = usePermissions();
  const canReadPatient = can("patients", "view");
  const canCreate = can("exams", "create");
  const canDelete = can("exams", "delete");
  const suspended = useContext(ReadSuspensionContext);
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;
  const [identity, setIdentity] = useState<ExamPatientIdentity | null>(null);
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState(0);
  const uploadController = useRef<AbortController>();
  const [preview, setPreview] = useState<{ id: string; url: string; name: string } | null>(null);
  const [deletion, setDeletion] = useState<{ id: string; filename: string; patient: string } | null>(null);
  const [reviewRequired, setReviewRequired] = useState(false);
  const [reloading, setReloading] = useState(false);
  const deleteBusy = useRef(false);
  const pageGeneration = useRef(0);
  const previewRequest = useRef(0);
  const active = useRef(true);
  const fileControllers = useRef(new Map<AbortController, string>());
  const endPage = useCallback((reason: EndReason) => {
    active.current = false;
    uploadController.current?.abort();
    for (const controller of fileControllers.current.keys()) controller.abort();
    fileControllers.current.clear();
    onEnd(reason);
  }, [onEnd]);
  const onMissing = useCallback(() => endPage("missing"), [endPage]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      uploadController.current?.abort();
      for (const controller of fileControllers.current.keys()) controller.abort();
      fileControllers.current.clear();
      pageGeneration.current++; previewRequest.current++;
    };
  }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  const policyQuery = useQuery({ queryKey: ["exams", "upload-policy"],
    queryFn: ({ signal }) => examService.uploadPolicy(signal), enabled: !suspended });

  const form = useForm<UploadForm>({
    resolver: zodResolver(uploadSchema),
    defaultValues: {
      notes: "",
    },
  });
  // Subscribe before the permission branch so a later write revocation retains the form.
  const hasDraft = form.formState.isDirty;

  const examsQuery = useLiveQuery(["exams", patientId], signal => examService.listByPatient(patientId, signal),
    { exactOnDenied: true });
  const listMissing = axios.isAxiosError(examsQuery.error) && examsQuery.error.response?.status === 404;
  const policyDenied = axios.isAxiosError(policyQuery.error) && [401, 403].includes(policyQuery.error.response?.status ?? 0);
  useEffect(() => {
    if (listMissing) endPage("missing");
    else if (examsQuery.accessDenied || policyDenied) endPage("denied");
  }, [listMissing, examsQuery.accessDenied, policyDenied, endPage]);
  useEffect(() => {
    if (!suspended) return;
    for (const controller of fileControllers.current.keys()) controller.abort();
    fileControllers.current.clear();
    previewRequest.current++; setPreview(null);
  }, [suspended]);
  useEffect(() => {
    if (!canReadPatient || identity?.denied) setDeletion(null);
  }, [canReadPatient, identity?.denied]);
  useEffect(() => {
    if (!examsQuery.data || examsQuery.isError) return;
    const ids = new Set(examsQuery.data.map(exam => exam.id));
    for (const [controller, id] of fileControllers.current) {
      if (!ids.has(id)) { controller.abort(); fileControllers.current.delete(controller); }
    }
    if (preview && !ids.has(preview.id)) { previewRequest.current++; setPreview(null); }
    if (deletion && !ids.has(deletion.id) && !deleteBusy.current) {
      setDeletion(null); setReviewRequired(true);
    }
  }, [examsQuery.data, examsQuery.isError, preview, deletion]);

  function fileError(error: unknown, examId: string, message: string) {
    if (!active.current || suspendedRef.current) return;
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status === 401 || status === 403) { endPage("denied"); return; }
    if (status === 404) {
      for (const [controller, id] of fileControllers.current) if (id === examId) controller.abort();
      previewRequest.current++;
      setPreview(current => current?.id === examId ? null : current);
      examsQuery.refresh();
    }
    toast(message, "error");
  }

  const uploadMutation = useMutation({
    mutationFn: (values: UploadForm) => {
      if (!active.current || suspendedRef.current || !canCreate) throw new axios.CanceledError();
      const file = values.file[0] as File;
      const policy = policyQuery.data;
      if (!policy || file.size > policy.max_bytes || file.size === 0) {
        throw new Error("Confira o tamanho do arquivo e aguarde o limite de envio carregar.");
      }
      if (!policy.extensions.some((extension) => file.name.toLowerCase().endsWith(extension))) {
        throw new Error("Envie um PDF, JPG ou PNG.");
      }
      uploadController.current = new AbortController();
      setProgress(0);
      return examService.upload(patientId, file, values.notes, { signal: uploadController.current.signal,
        onProgress: value => { if (active.current) setProgress(value); } });
    },
    onSuccess: () => {
      if (!active.current) return;
      toast("Exame enviado com sucesso.");
      form.reset({ notes: "" });
      void queryClient.invalidateQueries({ queryKey: ["exams", patientId] });
    },
    onError: (error) => { if (!active.current) return; toast(axios.isCancel(error) ? "Envio interrompido. Confira a lista de exames."
      : error instanceof Error && !axios.isAxiosError(error) ? error.message : getApiErrorMessage(error), "error"); },
    onSettled: () => { if (active.current) void queryClient.invalidateQueries({ queryKey: ["exams", patientId] }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (target: { id: string; patientId: string; generation: number }) => examService.remove(target.id),
    onSuccess: (_, target) => {
      void queryClient.invalidateQueries({ queryKey: ["exams", target.patientId] });
      if (target.generation !== pageGeneration.current) return;
      toast("Exame removido.");
      previewRequest.current++;
      setPreview(current => current?.id === target.id ? null : current);
      setDeletion(null);
    },
    onError: (error, target) => {
      if (target.generation !== pageGeneration.current) return;
      setDeletion(null); setReviewRequired(true);
      toast(getApiErrorMessage(error), "error");
    },
    onSettled: () => { deleteBusy.current = false; },
  });

  async function reloadExams() {
    if (reloading) return;
    const generation = pageGeneration.current;
    setReloading(true);
    try {
      const [exams, patientReady] = await Promise.all([examsQuery.refetch({ cancelRefetch: false }), identity?.reload()]);
      if (generation !== pageGeneration.current) return;
      if (exams.isError || !patientReady) {
        toast("Não foi possível recarregar. Confira novamente antes de excluir.", "error");
        return;
      }
      previewRequest.current++; setPreview(null); setDeletion(null); setReviewRequired(false);
    } finally {
      if (generation === pageGeneration.current) setReloading(false);
    }
  }

  if (examsQuery.accessDenied || policyDenied || listMissing) return <LoadingState message="Encerrando acesso aos exames..." />;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-slate-800">Exames do Paciente</h2>
            <ExamPatientHeader key={canReadPatient ? "allowed" : "denied"} patientId={patientId}
              enabled={canReadPatient} onIdentity={setIdentity} onMissing={onMissing} />
          </div>

          <Link to="/patients">
            <Button variant="outline">Voltar para Pacientes</Button>
          </Link>
        </div>
      </Card>

      {(canCreate || hasDraft || uploadMutation.isPending) && (
        <Card>
          <h3 className="font-semibold text-slate-800">Upload de exame</h3>
          <p className="text-sm text-slate-500">PDF, JPG ou PNG. {policyQuery.data
            ? `Limite por arquivo: ${(policyQuery.data.max_bytes / 1024 / 1024).toFixed(1)} MB.`
            : "Carregando limite de envio..."}</p>
          {policyQuery.isError && <ErrorState message="Não foi possível consultar o limite de envio. Recarregue a página." />}
          {!canCreate && <p role="status">Sem permissão para enviar exames. Seu rascunho foi mantido.</p>}
          <fieldset disabled={!canCreate || suspended}>
          <form
            className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]"
            onSubmit={form.handleSubmit((values) => uploadMutation.mutate(values))}
          >
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Arquivo *</label>
              <Input type="file" accept=".pdf,.jpg,.jpeg,.png" {...form.register("file")} />
              {form.formState.errors.file && (
                <p className="mt-1 text-xs text-red-600">{form.formState.errors.file.message as string}</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Notas</label>
              <Input placeholder="Ex.: radiografia panorâmica" {...form.register("notes")} />
            </div>

            <div className="self-end">
              <Button type="submit" disabled={uploadMutation.isPending || !policyQuery.data}>
                {uploadMutation.isPending ? "Enviando..." : "Enviar"}
              </Button>
            </div>
          </form>
          </fieldset>
          {uploadMutation.isPending && <div className="mt-3 space-x-3" role="status">
            <span>{progress}% enviado{progress === 100 ? " — processando no servidor" : ""}</span>
            <Button variant="outline" onClick={() => uploadController.current?.abort()}>Cancelar envio</Button>
          </div>}
        </Card>
      )}

      <Card>
        <h3 className="mb-3 font-semibold text-slate-800">Arquivos enviados</h3>
        <LiveQueryStatus query={examsQuery} subject="exames" />

        {reviewRequired && <div role="alert" className="mb-3 space-y-2">
          <p>Confira a lista atualizada antes de escolher novamente um exame para excluir.</p>
          <Button variant="outline" disabled={reloading} onClick={() => void reloadExams()}>
            {reloading ? "Recarregando..." : "Recarregar lista para conferir"}
          </Button>
        </div>}

        {examsQuery.isLoading && <LoadingState message="Carregando exames..." />}

        {examsQuery.data && (
          <>
            {(examsQuery.data?.length ?? 0) === 0 ? (
              <EmptyState message="Nenhum exame enviado ainda." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="p-2 font-semibold">Arquivo</th>
                      <th className="p-2 font-semibold">Tipo</th>
                      <th className="p-2 font-semibold">Tamanho (bytes)</th>
                      <th className="p-2 font-semibold">Enviado em</th>
                      <th className="p-2 font-semibold">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {examsQuery.data?.map((exam) => (
                      <tr key={exam.id} className="border-b last:border-b-0">
                        <td className="p-2 font-medium text-slate-800">{exam.original_filename}</td>
                        <td className="p-2">{exam.mime_type}</td>
                        <td className="p-2">{exam.size_bytes}</td>
                        <td className="p-2">{formatDateTime(exam.uploaded_at)}</td>
                        <td className="p-2">
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              onClick={() => {
                                const controller = new AbortController();
                                fileControllers.current.set(controller, exam.id);
                                void examService.download(exam.id, exam.original_filename, controller.signal)
                                  .catch(error => { if (!controller.signal.aborted) fileError(error, exam.id, "Não foi possível baixar o exame. Tente novamente."); })
                                  .finally(() => fileControllers.current.delete(controller));
                              }}
                            >
                              Baixar
                            </Button>
                            {["image/png", "image/jpeg"].includes(exam.mime_type) && <Button
                              variant="outline"
                              onClick={() => {
                                const request = ++previewRequest.current;
                                const controller = new AbortController();
                                fileControllers.current.set(controller, exam.id);
                                void examService.previewImage(exam.id, exam.mime_type, controller.signal).then((blob) => {
                                  if (active.current && !suspendedRef.current && !controller.signal.aborted && request === previewRequest.current) setPreview({ id: exam.id, url: URL.createObjectURL(blob), name: exam.original_filename });
                                }).catch(error => { if (!controller.signal.aborted && request === previewRequest.current) fileError(error, exam.id, "Não foi possível visualizar a imagem. Tente baixar o arquivo."); })
                                  .finally(() => fileControllers.current.delete(controller));
                              }}
                            >
                              Visualizar imagem
                            </Button>}
                            {canDelete && (
                              <Button
                                variant="danger"
                                disabled={deleteMutation.isPending || reviewRequired || reloading || !canReadPatient || !identity?.ready}
                                onClick={() => {
                                  setDeletion({ id: exam.id, filename: exam.original_filename, patient: identity!.data!.full_name });
                                }}
                              >
                                Excluir
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Card>
      <Modal open={Boolean(deletion) && canReadPatient && !identity?.denied} title="Excluir exame" onClose={() => { if (!deleteBusy.current) setDeletion(null); }}>
        {deletion && <div className="space-y-3">
          <p>Excluir o arquivo <strong>{deletion.filename}</strong> do paciente <strong>{deletion.patient}</strong>?</p>
          <p>O exame será removido. A remoção do arquivo pode levar alguns instantes.</p>
          <Button variant="outline" disabled={deleteMutation.isPending} onClick={() => setDeletion(null)}>Cancelar exclusão</Button>
          <Button variant="danger" disabled={deleteMutation.isPending || reviewRequired || !canDelete || !canReadPatient || !identity?.ready} onClick={() => {
            if (deleteBusy.current || reviewRequired || !canDelete || !canReadPatient || !identity?.ready || suspendedRef.current) return;
            deleteBusy.current = true;
            deleteMutation.mutate({ id: deletion.id, patientId, generation: pageGeneration.current });
          }}>{deleteMutation.isPending ? "Excluindo..." : "Confirmar exclusão"}</Button>
        </div>}
      </Modal>
      <Modal open={Boolean(preview)} title={preview?.name ?? "Imagem do exame"} onClose={() => { previewRequest.current++; setPreview(null); }}>
        {preview && <img src={preview.url} alt={preview.name} className="max-h-[70vh] max-w-full object-contain"
          onError={() => { setPreview(null); toast("Imagem inválida para prévia. Use o download.", "error"); }} />}
      </Modal>
    </div>
  );
}
