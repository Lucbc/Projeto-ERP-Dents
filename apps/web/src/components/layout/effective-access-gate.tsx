import { useEffect, useRef, type PropsWithChildren } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useEffectivePermissions, type EffectivePermissions } from "@/hooks/use-effective-permissions";
import { PermissionDisplayContext } from "@/hooks/use-permissions";
import { ReadSuspensionContext } from "@/hooks/read-suspension";
import type { PermissionResource } from "@/types";
import { Button } from "@/components/ui/button";

export function EffectiveAccessGate({ children }: PropsWithChildren) {
  const access = useEffectivePermissions();
  const { logout } = useAuth();
  const client = useQueryClient();
  const snapshot = useRef<EffectivePermissions | null>(null);
  const previous = useRef<EffectivePermissions | null>(null);
  const notice = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const blocked = !["anonymous", "verified"].includes(access.status);
  const terminal = access.status === "denied";
  if (access.status === "verified") snapshot.current = access;
  if (terminal || access.status === "anonymous") snapshot.current = null;
  useEffect(() => {
    if (blocked) {
      notice.current?.focus();
      void client.cancelQueries({ predicate: q => !(q.queryKey[0] === "permissions" && q.queryKey[1] === "me") });
    }
    if (content.current) {
      if (blocked) content.current.setAttribute("inert", "");
      else content.current.removeAttribute("inert");
    }
    if (terminal) client.removeQueries({ predicate: q => !(q.queryKey[0] === "permissions" && q.queryKey[1] === "me") });
  }, [blocked, terminal, client]);
  useEffect(() => {
    if (access.status !== "verified") return;
    const before = previous.current;
    previous.current = access;
    if (!before) return;
    for (const resource of Object.keys(before.permissions) as PermissionResource[]) {
      if (before.can(resource, "view") && !access.can(resource, "view")) {
        const prefixes: string[] = resource === "patients" ? ["patients", "patient"] : [resource];
        void client.cancelQueries({ predicate: q => prefixes.includes(String(q.queryKey[0])) });
        client.removeQueries({ predicate: q => prefixes.includes(String(q.queryKey[0])) });
      }
    }
  }, [access, client]);
  const display = access.status === "verified" ? access : snapshot.current;
  return <>
    {blocked && <div ref={notice} tabIndex={-1} role="alert" className="mx-auto mt-16 max-w-lg space-y-4 rounded-sm border bg-card p-6 text-card-foreground">
      <h1 className="text-lg font-semibold">{terminal ? "Acesso não autorizado" : "Verificação de acesso"}</h1>
      <p>{terminal ? "Seu acesso não pôde ser autorizado. Entre novamente após revisar as permissões."
        : access.status === "identity-mismatch" ? "Seu perfil mudou. Validando a identidade antes de continuar."
        : "O conteúdo está oculto até verificar suas permissões. Seus rascunhos desta sessão foram preservados."}</p>
      {!terminal && <Button disabled={!access.online || access.isFetching} onClick={access.refresh}>Verificar acesso novamente</Button>}
      <Button variant="outline" onClick={logout}>Sair</Button>
    </div>}
    {!terminal && (display || access.status === "anonymous") &&
      <div ref={content} hidden={blocked} style={blocked ? { display: "none" } : undefined} aria-hidden={blocked || undefined}>
        <ReadSuspensionContext.Provider value={blocked}>
          <PermissionDisplayContext.Provider value={display}>{children}</PermissionDisplayContext.Provider>
        </ReadSuspensionContext.Provider>
      </div>}
  </>;
}
