import { useState } from "react";
import { isAxiosError } from "axios";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { getApiErrorMessage } from "@/lib/api";

export function useAvailabilityReview(refresh: () => Promise<unknown>) {
  const { toast } = useToast();
  const [message, setMessage] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const reload = useMutation({
    mutationFn: refresh,
    onSuccess: () => setBlocked(false),
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });
  const handle = (error: unknown) => {
    if (!isAxiosError(error) || error.response?.data?.code !== "availability_conflict") return false;
    setMessage(getApiErrorMessage(error));
    setBlocked(true);
    return true;
  };
  return { message, blocked, reload, handle, reset: () => { setMessage(null); setBlocked(false); } };
}

export function AvailabilityReview({ review }: { review: ReturnType<typeof useAvailabilityReview> }) {
  if (!review.message) return null;
  return <div role="alert" className="md:col-span-2 rounded border border-amber-300 bg-amber-50 p-3">
    <p>{review.message}</p>
    <p>Seu rascunho foi mantido. {review.blocked ? "Atualize os dados antes de revisar e salvar novamente." : "Dados atualizados. Revise o rascunho antes de salvar novamente."}</p>
    <Button type="button" variant="outline" disabled={review.reload.isPending} onClick={() => review.reload.mutate()}>
      Atualizar disponibilidade para revisar
    </Button>
  </div>;
}
