import { Button } from "./button";

interface LiveStatus {
  online: boolean;
  isFetching: boolean;
  isError: boolean;
  dataUpdatedAt: number;
  refresh: () => void;
}

export function LiveQueryStatus({ query, subject }: { query: LiveStatus; subject?: string }) {
  const { online, isFetching, isError, dataUpdatedAt, refresh } = query;
  const message = subject ? (!online ? `Sem conexão. ${subject}: os dados podem estar desatualizados.`
    : isError ? (dataUpdatedAt ? `Não foi possível atualizar ${subject}. Os dados exibidos podem estar desatualizados.`
      : `Não foi possível carregar ${subject}.`)
    : isFetching ? `Atualizando ${subject}...` : "Atualização automática ativa.")
    : !online ? "Sem conexão. A agenda pode estar desatualizada."
    : isError ? (dataUpdatedAt ? "Não foi possível atualizar a agenda. Os dados exibidos podem estar desatualizados."
      : "Não foi possível carregar a agenda. As consultas não puderam ser verificadas.")
    : isFetching ? (dataUpdatedAt ? "Atualizando agenda..." : "Carregando agenda...") : "Atualização automática ativa.";
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded border bg-card p-3 text-foreground">
    <div role={!online || isError ? "alert" : "status"}>
      <p>{message}</p>
      <p className="text-sm text-muted-foreground">{dataUpdatedAt
        ? `Última atualização: ${new Date(dataUpdatedAt).toLocaleString("pt-BR")}`
        : subject ? "Ainda não foi possível verificar estes dados." : "Ainda não foi possível verificar as consultas."}</p>
    </div>
    <Button type="button" variant="outline" disabled={!online || isFetching} onClick={refresh}>Atualizar {subject ?? "agenda"}</Button>
  </div>;
}
