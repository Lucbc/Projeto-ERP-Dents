interface StateProps {
  message?: string;
}

export function LoadingState({ message = "Carregando..." }: StateProps) {
  return <p className="rounded-lg border bg-white p-4 text-sm text-slate-600">{message}</p>;
}

export function EmptyState({ message = "Nenhum registro encontrado." }: StateProps) {
  return <p className="rounded-lg border border-dashed bg-white p-4 text-sm text-slate-500">{message}</p>;
}

export function ErrorState({ message = "Erro ao carregar os dados." }: StateProps) {
  return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{message}</p>;
}
