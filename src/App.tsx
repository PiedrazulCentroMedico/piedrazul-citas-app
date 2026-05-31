import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { AppLayout } from './components/AppLayout';
import { AccessibilityTools } from './components/AccessibilityTools';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminSchedulesPage } from './pages/AdminSchedulesPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { HomePage } from './pages/HomePage';
import { InternalAppointmentsPage } from './pages/InternalAppointmentsPage';
import { InternalLoginPage } from './pages/InternalLoginPage';
import { InternalNewAppointmentPage } from './pages/InternalNewAppointmentPage';
import { InternalProfilePage } from './pages/InternalProfilePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PatientDashboardPage } from './pages/PatientDashboardPage';
import { PatientLoginPage } from './pages/PatientLoginPage';
import { PatientProfilePage } from './pages/PatientProfilePage';
import { PatientRegisterPage } from './pages/PatientRegisterPage';
import { PublicBookingPage } from './pages/PublicBookingPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppLayout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/reservar" element={<PublicBookingPage />} />
            <Route path="/iniciar-sesion" element={<PatientLoginPage />} />
            <Route path="/crear-cuenta" element={<PatientRegisterPage />} />
            <Route path="/olvide-mi-contrasena" element={<ForgotPasswordPage />} />
            <Route path="/restablecer-contrasena" element={<ResetPasswordPage />} />

            <Route path="/portal/interno/login" element={<InternalLoginPage />} />

            <Route
              path="/portal/paciente"
              element={
                <ProtectedRoute roles={['Patient']} redirectTo="/iniciar-sesion">
                  <PatientDashboardPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/portal/paciente/perfil"
              element={
                <ProtectedRoute roles={['Patient']} redirectTo="/iniciar-sesion">
                  <PatientProfilePage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/portal/interno/citas"
              element={
                <ProtectedRoute roles={['Admin', 'Scheduler', 'Doctor']} redirectTo="/portal/interno/login">
                  <InternalAppointmentsPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/portal/interno/nueva-cita"
              element={
                <ProtectedRoute roles={['Admin', 'Scheduler']} redirectTo="/portal/interno/login">
                  <InternalNewAppointmentPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/portal/interno/reagendar"
              element={
                <ProtectedRoute roles={['Admin', 'Scheduler']} redirectTo="/portal/interno/login">
                  <InternalAppointmentsPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/portal/interno/configuracion"
              element={
                <ProtectedRoute roles={['Admin', 'Doctor']} redirectTo="/portal/interno/login">
                  <AdminSchedulesPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/portal/interno/usuarios"
              element={
                <ProtectedRoute roles={['Admin']} redirectTo="/portal/interno/login">
                  <AdminUsersPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/portal/interno/perfil"
              element={
                <ProtectedRoute roles={['Doctor']} redirectTo="/portal/interno/login">
                  <InternalProfilePage />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AppLayout>

        <AccessibilityTools />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;