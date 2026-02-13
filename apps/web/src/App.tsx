import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "@/components/layout/app-layout";
import { ProtectedRoute } from "@/components/layout/protected-route";
import { ToastProvider } from "@/components/ui/toast";
import { AuthProvider } from "@/hooks/use-auth";
import { queryClient } from "@/lib/query-client";
import { AppointmentsPage } from "@/pages/appointments/appointments-page";
import { CalendarPage } from "@/pages/appointments/calendar-page";
import { ConsultationPage } from "@/pages/consultations/consultation-page";
import { DashboardPage } from "@/pages/dashboard-page";
import { DentistsPage } from "@/pages/dentists/dentists-page";
import { LoginPage } from "@/pages/login-page";
import { PatientExamsPage } from "@/pages/patients/patient-exams-page";
import { PatientsPage } from "@/pages/patients/patients-page";
import { PermissionsPage } from "@/pages/permissions/permissions-page";
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
                <Route
                  index
                  element={
                    <ProtectedRoute permission={{ resource: "dashboard", action: "view" }}>
                      <DashboardPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="patients"
                  element={
                    <ProtectedRoute permission={{ resource: "patients", action: "view" }}>
                      <PatientsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="patients/:patientId"
                  element={
                    <ProtectedRoute permission={{ resource: "exams", action: "view" }}>
                      <PatientExamsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="dentists"
                  element={
                    <ProtectedRoute permission={{ resource: "dentists", action: "view" }}>
                      <DentistsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="appointments"
                  element={
                    <ProtectedRoute permission={{ resource: "appointments", action: "view" }}>
                      <AppointmentsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="calendar"
                  element={
                    <ProtectedRoute permission={{ resource: "calendar", action: "view" }}>
                      <CalendarPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="consultation"
                  element={
                    <ProtectedRoute
                      allowedRoles={["dentist"]}
                      permission={{ resource: "consultations", action: "view" }}
                    >
                      <ConsultationPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="users"
                  element={
                    <ProtectedRoute permission={{ resource: "users", action: "view" }}>
                      <UsersPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="permissions"
                  element={
                    <ProtectedRoute adminOnly>
                      <PermissionsPage />
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
