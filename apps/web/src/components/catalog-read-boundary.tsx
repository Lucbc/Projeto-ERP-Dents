import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ErrorState } from "./ui/states";

/** List access failure must discard its form without evicting other form references. */
export function CatalogReadBoundary({ resource, children }: {
  resource: "procedures" | "specialties" | "dentists" | "users"; children: (onDenied: () => void) => ReactNode;
}) {
  const client = useQueryClient();
  const [denied, setDenied] = useState(false);
  const onDenied = useCallback(() => setDenied(true), []);
  useEffect(() => {
    if (!denied) return;
    const queryKey = [resource, "list"];
    void client.cancelQueries({ queryKey });
    client.removeQueries({ queryKey });
  }, [denied, client, resource]);
  const label = { procedures: "procedimentos", specialties: "especialidades", dentists: "dentistas", users: "administração de usuários" }[resource];
  if (denied && resource === "users") return <ErrorState message="Seu acesso à administração de usuários foi encerrado. Entre novamente." />;
  if (denied) return <ErrorState message={`Seu acesso a ${label} foi encerrado. Entre novamente nesta página após revisar o acesso.`} />;
  return children(onDenied);
}
