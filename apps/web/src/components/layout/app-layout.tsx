import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import {
  CalendarDays,
  ClipboardList,
  ClipboardPlus,
  Home,
  KeyRound,
  LogOut,
  Moon,
  Search,
  Settings2,
  ShieldCheck,
  Stethoscope,
  Sun,
  Wallet,
  UserSquare2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { useTheme } from "@/hooks/use-theme";
import { getApiErrorMessage } from "@/lib/api";
import { userRoleLabels } from "@/lib/labels";
import { authService } from "@/lib/services";
import { cn } from "@/lib/utils";
import type { PermissionResource, UserRole } from "@/types";

interface MenuItem {
  to: string;
  label: string;
  icon: LucideIcon;
  resource: PermissionResource;
  roles?: UserRole[];
  adminOnly?: boolean;
}

const primaryMenu: MenuItem[] = [
  { to: "/", label: "Painel", icon: Home, resource: "dashboard" },
  { to: "/patients", label: "Pacientes", icon: UserSquare2, resource: "patients" },
  { to: "/appointments", label: "Consultas", icon: ClipboardList, resource: "appointments" },
  { to: "/calendar", label: "Agenda", icon: CalendarDays, resource: "calendar" },
  { to: "/financial", label: "Financeiro", icon: Wallet, resource: "financial" },
  { to: "/consultation", label: "Consulta", icon: Search, resource: "consultations", roles: ["dentist"] },
];

const settingsMenu: MenuItem[] = [
  { to: "/dentists", label: "Dentistas", icon: Stethoscope, resource: "dentists" },
  { to: "/specialties", label: "Especialidades", icon: Settings2, resource: "specialties" },
  { to: "/procedures", label: "Procedimentos", icon: ClipboardPlus, resource: "procedures" },
  { to: "/users", label: "Usuarios", icon: Users, resource: "users" },
  { to: "/permissions", label: "Permissoes", icon: ShieldCheck, resource: "permissions", adminOnly: true },
];

const titles: Record<string, string> = {
  "/": "Painel",
  "/patients": "Pacientes",
  "/dentists": "Dentistas",
  "/specialties": "Especialidades",
  "/procedures": "Procedimentos",
  "/appointments": "Consultas",
  "/calendar": "Agenda",
  "/financial": "Financeiro",
  "/consultation": "Consulta",
  "/users": "Usuarios",
  "/permissions": "Permissoes",
};

const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "Informe a senha atual."),
    new_password: z.string().min(8, "A nova senha deve ter no minimo 8 caracteres."),
    confirm_new_password: z.string().min(8, "Confirme a nova senha."),
  })
  .refine((value) => value.new_password === value.confirm_new_password, {
    message: "A confirmacao da senha nao confere.",
    path: ["confirm_new_password"],
  });

type ChangePasswordForm = z.infer<typeof changePasswordSchema>;

export function AppLayout() {
  const { user, logout } = useAuth();
  const { can, isLoading: isPermissionsLoading, isError: isPermissionsError } = usePermissions();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const location = useLocation();
  const [openChangePasswordModal, setOpenChangePasswordModal] = useState(false);

  const form = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      current_password: "",
      new_password: "",
      confirm_new_password: "",
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: (payload: ChangePasswordForm) =>
      authService.changePassword({
        current_password: payload.current_password,
        new_password: payload.new_password,
      }),
    onSuccess: () => {
      toast("Senha atualizada com sucesso.");
      setOpenChangePasswordModal(false);
      form.reset();
    },
    onError: (error) => toast(getApiErrorMessage(error), "error"),
  });

  const isMenuItemVisible = (item: MenuItem): boolean => {
    if (!user) return false;
    if (item.adminOnly && user.role !== "admin") return false;
    if (item.roles && !item.roles.includes(user.role)) return false;
    return can(item.resource, "view");
  };

  const visiblePrimaryMenu = primaryMenu.filter(isMenuItemVisible);
  const visibleSettingsMenu = settingsMenu.filter(isMenuItemVisible);
  const hasAnyVisibleMenu = visiblePrimaryMenu.length > 0 || visibleSettingsMenu.length > 0;

  const matchedPath = Object.keys(titles).find(
    (path) => location.pathname === path || location.pathname.startsWith(`${path}/`),
  );
  const currentTitle = matchedPath ? titles[matchedPath] : "ERP Dents";

  const renderMenuItem = (item: MenuItem) => (
    <NavLink
      key={item.to}
      to={item.to}
      className={({ isActive }) =>
        cn(
          "flex min-w-fit items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold",
          isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted",
        )
      }
    >
      <item.icon size={16} />
      {item.label}
    </NavLink>
  );

  const handleSubmitChangePassword = (values: ChangePasswordForm) => {
    changePasswordMutation.mutate(values);
  };

  return (
    <div className="min-h-screen bg-background text-foreground md:grid md:grid-cols-[240px_1fr]">
      <aside className="border-r border-border bg-card/95 p-4 backdrop-blur md:min-h-screen">
        <div className="mb-6">
          <p className="font-display text-xl font-semibold text-foreground">ERP Dents</p>
          <p className="text-xs text-muted-foreground">Clinica Odontologica</p>
        </div>

        <nav className="flex gap-2 overflow-x-auto pb-2 md:flex-col md:overflow-visible">
          {isPermissionsLoading && user?.role !== "admin" && (
            <p className="px-3 py-2 text-xs text-muted-foreground">Carregando menu...</p>
          )}
          {isPermissionsError && user?.role !== "admin" && (
            <p className="px-3 py-2 text-xs text-red-600">Erro ao carregar permissoes.</p>
          )}
          {!isPermissionsLoading && hasAnyVisibleMenu && (
            <>
              {visiblePrimaryMenu.map(renderMenuItem)}

              {visibleSettingsMenu.length > 0 && (
                <div className="md:mt-2 md:border-t md:border-border md:pt-3">
                  <p className="hidden px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:block">
                    Configuracoes
                  </p>
                  <div className="flex gap-2 md:flex-col">{visibleSettingsMenu.map(renderMenuItem)}</div>
                </div>
              )}
            </>
          )}
        </nav>

        <div className="mt-6 border-t border-border pt-4">
          <p className="text-sm font-semibold text-foreground">{user?.name}</p>
          <p className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">
            {user ? userRoleLabels[user.role] : ""}
          </p>
          <Button onClick={toggleTheme} variant="outline" className="mb-2 w-full">
            {theme === "dark" ? <Sun size={14} className="mr-2" /> : <Moon size={14} className="mr-2" />}
            {theme === "dark" ? "Modo claro" : "Modo escuro"}
          </Button>
          <Button
            onClick={() => setOpenChangePasswordModal(true)}
            variant="outline"
            className="mb-2 w-full"
          >
            <KeyRound size={14} className="mr-2" />
            Trocar senha
          </Button>
          <Button onClick={logout} variant="outline" className="w-full">
            <LogOut size={14} className="mr-2" />
            Sair
          </Button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="border-b border-border bg-card/75 px-4 py-3 backdrop-blur md:px-6">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">ERP Dents</p>
          <h1 className="font-display text-xl font-semibold text-foreground">{currentTitle}</h1>
        </header>

        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>

      <Modal
        open={openChangePasswordModal}
        onClose={() => {
          setOpenChangePasswordModal(false);
          form.reset();
        }}
        title="Trocar senha"
      >
        <form className="grid gap-3" onSubmit={form.handleSubmit(handleSubmitChangePassword)}>
          <div>
            <label className="mb-1 block text-sm font-semibold text-foreground">Senha atual *</label>
            <Input type="password" {...form.register("current_password")} />
            {form.formState.errors.current_password && (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.current_password.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-foreground">Nova senha *</label>
            <Input type="password" {...form.register("new_password")} />
            {form.formState.errors.new_password && (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.new_password.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-foreground">Confirmar nova senha *</label>
            <Input type="password" {...form.register("confirm_new_password")} />
            {form.formState.errors.confirm_new_password && (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.confirm_new_password.message}</p>
            )}
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpenChangePasswordModal(false);
                form.reset();
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={changePasswordMutation.isPending}>
              {changePasswordMutation.isPending ? "Salvando..." : "Atualizar senha"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
