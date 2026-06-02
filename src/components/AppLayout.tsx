import { useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { hasInternalAccess, hasSettingsAccess, isDoctorRole } from '../utils/validators';
import logoImage from '../assets/logo.png';

interface LayoutProps {
  children: React.ReactNode;
}

function NavIcon({ type }: { type: 'home' | 'calendar' | 'user' | 'plus' }) {
  const icons = {
    home: (
      <path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10.5Z" />
    ),
    calendar: (
      <>
        <path d="M7 2v4M17 2v4M4 9h16" />
        <rect x="4" y="5" width="16" height="16" rx="2" />
        <path d="M8 13h2M12 13h2M16 13h2M8 17h2M12 17h2" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
      </>
    ),
    plus: (
      <>
        <circle cx="9" cy="8" r="4" />
        <path d="M2.5 21c1.2-4 3.8-6 6.5-6" />
        <path d="M18 8v8M14 12h8" />
      </>
    ),
  };

  return (
    <svg className="nav-svg" viewBox="0 0 24 24" aria-hidden="true">
      {icons[type]}
    </svg>
  );
}

export function AppLayout({ children }: LayoutProps) {
  const { session, logout } = useAuth();
  const location = useLocation();

  const isInternalRoute = location.pathname.startsWith('/portal/interno');
  const isInternalLoginRoute = location.pathname === '/portal/interno/login';
  const internalAccess = hasInternalAccess(session?.roles ?? []);
  const settingsAccess = hasSettingsAccess(session?.roles ?? []);
  const doctorAccess = isDoctorRole(session?.roles ?? []);
  const isPatient = session?.roles.includes('Patient') ?? false;

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <img className="brand-mark brand-logo" src={logoImage} alt="Logo de Piedrazul" />
            <div>
              <strong>Piedrazul</strong>
              <small>Centro médico</small>
            </div>
          </Link>

          <nav className="main-nav" aria-label="Navegación principal">
            {!isInternalRoute && (
              <>
                <NavLink to="/">
                  <NavIcon type="home" />
                  Inicio
                </NavLink>
                <NavLink to="/reservar">
                  <NavIcon type="calendar" />
                  Reservar cita
                </NavLink>
                {isPatient && <NavLink to="/portal/paciente">Mi portal</NavLink>}
                <NavLink to="/preguntas-frecuentes">Preguntas frecuentes</NavLink>
              </>
            )}
            {isInternalRoute && internalAccess && <NavLink to="/portal/interno/citas">Portal interno</NavLink>}
            {isInternalRoute && internalAccess && <NavLink to="/preguntas-frecuentes">Preguntas frecuentes</NavLink>}
            {isInternalRoute && settingsAccess && <NavLink to="/portal/interno/configuracion">Configuración</NavLink>}
            {isInternalRoute && doctorAccess && <NavLink to="/portal/interno/perfil">Mi perfil</NavLink>}
          </nav>

          <div className="header-actions">
            {session ? (
              <>
                <span className="welcome-chip">
                  <strong>{session.displayName}</strong>
                  <span>{session.roles.includes('Patient') ? 'Paciente' : 'Personal autorizado'}</span>
                </span>
                <button className="button" onClick={() => void logout()}>
                  Cerrar sesión
                </button>
              </>
            ) : !isInternalLoginRoute ? (
              <>
                <NavLink className="button button-secondary header-button" to="/iniciar-sesion">
                  <NavIcon type="user" />
                  Iniciar sesión
                </NavLink>
                <NavLink className="button header-button button-success" to="/crear-cuenta">
                  <NavIcon type="plus" />
                  Crear cuenta
                </NavLink>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main className="page-container">{children}</main>

      <footer className="footer">
        <div>
          <strong>Piedrazul - Centro Médico</strong>
          <p>Agenda tus citas en línea con una experiencia clara, usable y pensada para pacientes.</p>
        </div>
        {!isInternalRoute && (
          <div className="footer-links">
            <Link to="/reservar">Reservar cita</Link>
            <Link to="/preguntas-frecuentes">Preguntas frecuentes</Link>
            {!session && <Link to="/iniciar-sesion">Iniciar sesión</Link>}
            <Link to="/portal/interno/login">Acceso interno</Link>
          </div>
        )}
      </footer>
    </div>
  );
}