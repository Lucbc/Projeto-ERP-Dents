import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "@/components/layout/app-layout";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { ToastProvider } from "@/components/ui/toast";
import { AuthProvider } from "@/hooks/use-auth";
import { queryClient } from "@/lib/query-client";
import { AppointmentsPage } from "@/pages/appointments/appointments-page";
import { CalendarPage } from "@/pages/appointments/calendar-page";
import { DashboardPage } from "@/pages/dashboard-page";
import { DentistsPage } from "@/pages/dentists/dentists-page";
import { LoginPage } from "@/pages/login-page";
import { PatientExamsPage } from "@/pages/patients/patient-exams-page";
import { PatientsPage } from "@/pages/patients/patients-page";
import { UsersPage } from "@/pages/users/users-page";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />

              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<DashboardPage />} />
                <Route path="patients" element={<PatientsPage />} />
                <Route path="patients/:patientId" element={<PatientExamsPage />} />
                <Route path="dentists" element={<DentistsPage />} />
                <Route path="appointments" element={<AppointmentsPage />} />
                <Route path="calendar" element={<CalendarPage />} />
                <Route
                  path="users"
                  element={
                    <ProtectedRoute adminOnly>
                      <UsersPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
