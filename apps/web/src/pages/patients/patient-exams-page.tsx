import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link, useParams } from "react-router-dom";
import { z } from "zod";

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
  notes: z.string().optional(),
});

type UploadForm = z.infer<typeof uploadSchema>;

export function PatientExamsPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const { toast } = useToast();
  const { can } = usePermissions();
  const queryClient = useQueryClient();

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
      return examService.upload(patientId!, file, values.notes);
    },
    onSuccess: () => {
      toast("Exame enviado com sucesso.");
      form.reset({ notes: "" });
      void queryClient.invalidateQueries({ queryKey: ["exams", patientId] });
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (examId: string) => examService.remove(examId),
    onSuccess: () => {
      toast("Exame removido.");
      void queryClient.invalidateQueries({ queryKey: ["exams", patientId] });
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

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
          <form
            className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]"
            onSubmit={form.handleSubmit((values) => uploadMutation.mutate(values))}
          >
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Arquivo *</label>
              <Input type="file" {...form.register("file")} />
              {form.formState.errors.file && (
                <p className="mt-1 text-xs text-red-600">{form.formState.errors.file.message as string}</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Notas</label>
              <Input placeholder="Ex.: radiografia panorâmica" {...form.register("notes")} />
            </div>

            <div className="self-end">
              <Button type="submit" disabled={uploadMutation.isPending}>
                {uploadMutation.isPending ? "Enviando..." : "Enviar"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <h3 className="mb-3 font-semibold text-slate-800">Arquivos enviados</h3>

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
                                void examService.download(exam.id, exam.original_filename);
                              }}
                            >
                              Baixar
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => {
                                void examService.openInBrowser(exam.id);
                              }}
                            >
                              Abrir
                            </Button>
                            {canDelete && (
                              <Button
                                variant="danger"
                                onClick={() => {
                                  if (window.confirm("Deseja remover este exame?")) {
                                    deleteMutation.mutate(exam.id);
                                  }
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
    </div>
  );
}
