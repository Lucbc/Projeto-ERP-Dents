import {
  CalendarDays,
  ClipboardList,
  Home,
  LogOut,
  Stethoscope,
  UserSquare2,
  Users,
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const menu = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/patients", label: "Pacientes", icon: UserSquare2 },
  { to: "/dentists", label: "Dentistas", icon: Stethoscope },
  { to: "/appointments", label: "Consultas", icon: ClipboardList },
  { to: "/calendar", label: "Agenda", icon: CalendarDays },
];

const titles: Record<string, string> = {
  "/": "Dashboard",
  "/patients": "Pacientes",
  "/dentists": "Dentistas",
  "/appointments": "Consultas",
  "/calendar": "Agenda",
  "/users": "Usuarios",
};

export function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const matchedPath = Object.keys(titles).find(
    (path) => location.pathname === path || location.pathname.startsWith(`${path}/`),
  );
  const currentTitle = matchedPath ? titles[matchedPath] : "ERP Dents";

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="border-r bg-white/95 p-4 backdrop-blur md:min-h-screen">
        <div className="mb-6">
          <p className="font-display text-xl font-semibold text-slate-800">ERP Dents</p>
          <p className="text-xs text-slate-500">Clinica Odontologica</p>
        </div>

        <nav className="flex gap-2 overflow-x-auto pb-2 md:flex-col md:overflow-visible">
          {menu.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex min-w-fit items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold",
                  isActive ? "bg-cyan-100 text-cyan-900" : "text-slate-600 hover:bg-slate-100",
                )
              }
            >
              <item.icon size={16} />
              {item.label}
            </NavLink>
          ))}

          {user?.role === "admin" && (
            <NavLink
              to="/users"
              className={({ isActive }) =>
                cn(
                  "flex min-w-fit items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold",
                  isActive ? "bg-cyan-100 text-cyan-900" : "text-slate-600 hover:bg-slate-100",
                )
              }
            >
              <Users size={16} />
              Usuarios
            </NavLink>
          )}
        </nav>

        <div className="mt-6 border-t pt-4">
          <p className="text-sm font-semibold text-slate-700">{user?.name}</p>
          <p className="mb-3 text-xs uppercase tracking-wide text-slate-500">{user?.role}</p>
          <Button onClick={logout} variant="outline" className="w-full">
            <LogOut size={14} className="mr-2" />
            Sair
          </Button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="border-b border-slate-200 bg-white/75 px-4 py-3 backdrop-blur md:px-6">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">ERP Dents</p>
          <h1 className="font-display text-xl font-semibold text-slate-800">{currentTitle}</h1>
        </header>

        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

