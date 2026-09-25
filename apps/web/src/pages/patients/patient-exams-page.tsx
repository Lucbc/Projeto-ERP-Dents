import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link, useParams } from "react-router-dom";
import { z } from "zod";
import { useEffect, useRef, useState } from "react";
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
import { examService, patientService } from "@/lib/services";

const uploadSchema = z.object({
  file: z
    .any()
    .refine((value) => value && value.length > 0, "Selecione um arquivo para upload."),
  notes: z.string().max(2000, "Máximo de 2000 caracteres.").optional(),
});

type UploadForm = z.infer<typeof uploadSchema>;

export function PatientExamsPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const { toast } = useToast();
  const { can } = usePermissions();
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
  useEffect(() => () => { uploadController.current?.abort(); previewRequest.current++; }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  useEffect(() => {
    setPreview(null); setDeletion(null); setReviewRequired(false); setReloading(false);
    return () => { pageGeneration.current++; previewRequest.current++; };
  }, [patientId]);
  const policyQuery = useQuery({ queryKey: ["exams", "upload-policy"], queryFn: examService.uploadPolicy });

  const form = useForm<UploadForm>({
    resolver: zodResolver(uploadSchema),
    defaultValues: {
      notes: "",
    },
  });

  const patientQuery = useQuery({
    queryKey: ["patient", patientId],
    queryFn: () => patientService.get(patientId!),
    enabled: Boolean(patientId),
  });

  const examsQuery = useQuery({
    queryKey: ["exams", patientId],
    queryFn: () => examService.listByPatient(patientId!),
    enabled: Boolean(patientId),
  });

  const uploadMutation = useMutation({
    mutationFn: (values: UploadForm) => {
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
      return examService.upload(patientId!, file, values.notes, { signal: uploadController.current.signal, onProgress: setProgress });
    },
    onSuccess: () => {
      toast("Exame enviado com sucesso.");
      form.reset({ notes: "" });
      void queryClient.invalidateQueries({ queryKey: ["exams", patientId] });
    },
    onError: (error) => toast(axios.isCancel(error) ? "Envio interrompido. Confira a lista de exames."
      : error instanceof Error && !axios.isAxiosError(error) ? error.message : getApiErrorMessage(error), "error"),
    onSettled: () => { void queryClient.invalidateQueries({ queryKey: ["exams", patientId] }); },
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
      const [exams, patient] = await Promise.all([examsQuery.refetch(), patientQuery.refetch()]);
      if (generation !== pageGeneration.current) return;
      if (exams.isError || patient.isError) {
        toast("Não foi possível recarregar. Confira novamente antes de excluir.", "error");
        return;
      }
      previewRequest.current++; setPreview(null); setDeletion(null); setReviewRequired(false);
    } finally {
      if (generation === pageGeneration.current) setReloading(false);
    }
  }

  const canCreate = can("exams", "create");
  const canDelete = can("exams", "delete");

  if (!patientId) {
    return <ErrorState message="Paciente não informado." />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-slate-800">Exames do Paciente</h2>
            {patientQuery.isLoading ? (
              <p className="text-sm text-slate-500">Carregando paciente...</p>
            ) : (
              <p className="text-sm text-slate-500">
                {patientQuery.data?.full_name ?? "Paciente"} ({patientQuery.data?.cpf ?? "sem CPF"})
              </p>
            )}
          </div>

          <Link to="/patients">
            <Button variant="outline">Voltar para Pacientes</Button>
          </Link>
        </div>
      </Card>

      {canCreate && (
        <Card>
          <h3 className="font-semibold text-slate-800">Upload de exame</h3>
          <p className="text-sm text-slate-500">PDF, JPG ou PNG. {policyQuery.data
            ? `Limite por arquivo: ${(policyQuery.data.max_bytes / 1024 / 1024).toFixed(1)} MB.`
            : "Carregando limite de envio..."}</p>
          {policyQuery.isError && <ErrorState message="Não foi possível consultar o limite de envio. Recarregue a página." />}
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
          {uploadMutation.isPending && <div className="mt-3 space-x-3" role="status">
            <span>{progress}% enviado{progress === 100 ? " — processando no servidor" : ""}</span>
            <Button variant="outline" onClick={() => uploadController.current?.abort()}>Cancelar envio</Button>
          </div>}
        </Card>
      )}

      <Card>
        <h3 className="mb-3 font-semibold text-slate-800">Arquivos enviados</h3>

        {reviewRequired && <div role="alert" className="mb-3 space-y-2">
          <p>Confira a lista atualizada antes de escolher novamente um exame para excluir.</p>
          <Button variant="outline" disabled={reloading} onClick={() => void reloadExams()}>
            {reloading ? "Recarregando..." : "Recarregar lista para conferir"}
          </Button>
        </div>}

        {examsQuery.isLoading && <LoadingState message="Carregando exames..." />}
        {examsQuery.isError && <ErrorState message="Erro ao carregar exames." />}

        {!examsQuery.isLoading && !examsQuery.isError && (
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
                                void examService.download(exam.id, exam.original_filename)
                                  .catch(() => toast("Não foi possível baixar o exame. Tente novamente.", "error"));
                              }}
                            >
                              Baixar
                            </Button>
                            {["image/png", "image/jpeg"].includes(exam.mime_type) && <Button
                              variant="outline"
                              onClick={() => {
                                const request = ++previewRequest.current;
                                void examService.previewImage(exam.id, exam.mime_type).then((blob) => {
                                  if (request === previewRequest.current) setPreview({ id: exam.id, url: URL.createObjectURL(blob), name: exam.original_filename });
                                }).catch(() => { if (request === previewRequest.current) toast("Não foi possível visualizar a imagem. Tente baixar o arquivo.", "error"); });
                              }}
                            >
                              Visualizar imagem
                            </Button>}
                            {canDelete && (
                              <Button
                                variant="danger"
                                disabled={deleteMutation.isPending || reviewRequired || reloading || !patientQuery.data || patientQuery.isError}
                                onClick={() => {
                                  setDeletion({ id: exam.id, filename: exam.original_filename, patient: patientQuery.data!.full_name });
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
      <Modal open={Boolean(deletion)} title="Excluir exame" onClose={() => { if (!deleteBusy.current) setDeletion(null); }}>
        {deletion && <div className="space-y-3">
          <p>Excluir o arquivo <strong>{deletion.filename}</strong> do paciente <strong>{deletion.patient}</strong>?</p>
          <p>O exame será removido. A remoção do arquivo pode levar alguns instantes.</p>
          <Button variant="outline" disabled={deleteMutation.isPending} onClick={() => setDeletion(null)}>Cancelar exclusão</Button>
          <Button variant="danger" disabled={deleteMutation.isPending || reviewRequired || !canDelete} onClick={() => {
            if (deleteBusy.current || reviewRequired || !canDelete) return;
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
