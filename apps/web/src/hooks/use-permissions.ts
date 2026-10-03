import { createContext, useContext } from "react";
import { useEffectivePermissions, type EffectivePermissions } from "./use-effective-permissions";

// Used only below the hidden/inert barrier to keep conditional drafts mounted.
export const PermissionDisplayContext = createContext<EffectivePermissions | null>(null);

export function usePermissions() {
  const effective = useEffectivePermissions();
  const display = useContext(PermissionDisplayContext);
  const access = display ?? effective;
  return { ...access, isLoading: access.status === "checking",
    isError: ["unavailable", "denied", "identity-mismatch"].includes(access.status) };
}
