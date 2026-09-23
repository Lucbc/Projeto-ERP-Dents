import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { getApiErrorMessage } from "@/lib/api";

export function useCatalogDeletion(remove: (id: string, version: number) => Promise<void>,
  refresh: () => Promise<{ isSuccess: boolean }>, onSuccess: () => void) {
  const [review, setReview] = useState<string | null>(null);
  const mutation = useMutation({
    retry: false,
    mutationFn: (item: { id: string; version: number }) => remove(item.id, item.version),
    onSuccess,
    onError: (error) => {
      const unknown = !isAxiosError(error) || !error.response || error.response.status >= 500;
      setReview(unknown ? "Não foi possível confirmar a exclusão. Recarregue e confira a lista antes de excluir novamente."
        : getApiErrorMessage(error));
    },
  });
  const reload = useMutation({
    retry: false,
    mutationFn: refresh,
    onSuccess: (result) => { if (result.isSuccess) setReview(null); },
  });
  return { mutation, review, reload, blocked: mutation.isPending || review !== null || reload.isPending };
}
