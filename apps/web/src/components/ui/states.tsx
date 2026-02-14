interface StateProps {
  message?: string;
}

export function LoadingState({ message = "Carregando..." }: StateProps) {
  return <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">{message}</p>;
}

export function EmptyState({ message = "Nenhum registro encontrado." }: StateProps) {
  return (
    <p className="rounded-lg border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
      {message}
    </p>
  );
}

export function ErrorState({ message = "Erro ao carregar os dados." }: StateProps) {
  return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{message}</p>;
}
