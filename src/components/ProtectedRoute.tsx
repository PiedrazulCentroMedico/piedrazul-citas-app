import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';


function getRoleHomePath(roles: string[], currentPath: string) {
  if (roles.includes('Patient')) return '/portal/paciente';
  if (roles.includes('Scheduler')) return '/portal/interno/nueva-cita';
  if (roles.includes('Doctor')) return '/portal/interno/citas';
  if (roles.includes('Admin')) return '/portal/interno/citas';
  return currentPath.startsWith('/portal/interno') ? '/portal/interno/login' : '/';
}

interface ProtectedRouteProps {
  children: React.ReactNode;
  roles?: string[];
  redirectTo?: string;
}

export function ProtectedRoute({ children, roles = [], redirectTo = '/' }: ProtectedRouteProps) {
  const { ready, session } = useAuth();
  const location = useLocation();

  if (!ready) {
    return <div className="loading-card">Cargando portal...</div>;
  }

  if (!session) {
    return <Navigate to={redirectTo} replace state={{ from: location }} />;
  }

  if (roles.length > 0 && !roles.some((role) => session.roles.includes(role))) {
    return <Navigate to={getRoleHomePath(session.roles, location.pathname)} replace />;
  }

  return <>{children}</>;
}
