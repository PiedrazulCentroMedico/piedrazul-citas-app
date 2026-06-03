import { useEffect, useState } from 'react';
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
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('piedrazul-theme') === 'dark');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  const isInternalRoute = location.pathname.startsWith('/portal/interno');
  const isInternalLoginRoute = location.pathname === '/portal/interno/login';
  const internalAccess = hasInternalAccess(session?.roles ?? []);
  const settingsAccess = hasSettingsAccess(session?.roles ?? []);
  const doctorAccess = isDoctorRole(session?.roles ?? []);
  const isPatient = session?.roles.includes('Patient') ?? false;
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const theme = isDarkMode ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
    localStorage.setItem('piedrazul-theme', theme);
  }, [isDarkMode]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to={isInternalRoute && internalAccess ? "/portal/interno/citas" : "/"} className="brand">
            <img className="brand-mark brand-logo" src={logoImage} alt="Logo de Piedrazul" />
            <div>
              <strong>Piedrazul</strong>
              <small>Centro médico</small>
            </div>
          </Link>

          <button
            type="button"
            className={`mobile-menu-toggle ${isMobileMenuOpen ? 'is-open' : ''}`}
            aria-label={isMobileMenuOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'}
            aria-expanded={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen((open) => !open)}
          >
            <span />
            <span />
            <span />
            <strong>{isMobileMenuOpen ? 'Cerrar' : 'Menú'}</strong>
          </button>

          <nav className={`main-nav ${isMobileMenuOpen ? 'is-open' : ''}`} aria-label="Navegación principal">
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
            {isInternalRoute && internalAccess && <NavLink to="/portal/interno/preguntas-frecuentes">Preguntas frecuentes</NavLink>}
            {isInternalRoute && settingsAccess && <NavLink to="/portal/interno/configuracion">Configuración</NavLink>}
            {isInternalRoute && doctorAccess && <NavLink to="/portal/interno/perfil">Mi perfil</NavLink>}
          </nav>

          <div className={`header-actions ${isMobileMenuOpen ? 'is-open' : ''}`}>
            <label className="theme-switch" title={isDarkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'} aria-label={isDarkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}>
              <span className="sun">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
                  <g fill="#ffd43b">
                    <circle r="5" cy="12" cx="12" />
                    <path d="m21 13h-1a1 1 0 0 1 0-2h1a1 1 0 0 1 0 2zm-17 0h-1a1 1 0 0 1 0-2h1a1 1 0 0 1 0 2zm13.66-5.66a1 1 0 0 1-.66-.29 1 1 0 0 1 0-1.41l.71-.71a1 1 0 1 1 1.41 1.41l-.71.71a1 1 0 0 1-.75.29zm-12.02 12.02a1 1 0 0 1-.71-.29 1 1 0 0 1 0-1.41l.71-.66a1 1 0 0 1 1.41 1.41l-.71.71a1 1 0 0 1-.7.24zm6.36-14.36a1 1 0 0 1-1-1v-1a1 1 0 0 1 2 0v1a1 1 0 0 1-1 1zm0 17a1 1 0 0 1-1-1v-1a1 1 0 0 1 2 0v1a1 1 0 0 1-1 1zm-5.66-14.66a1 1 0 0 1-.7-.29l-.71-.71a1 1 0 0 1 1.41-1.41l.71.71a1 1 0 0 1 0 1.41 1 1 0 0 1-.71.29zm12.02 12.02a1 1 0 0 1-.7-.29l-.66-.71a1 1 0 0 1 1.36-1.36l.71.71a1 1 0 0 1 0 1.41 1 1 0 0 1-.71.24z" />
                  </g>
                </svg>
              </span>
              <span className="moon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" aria-hidden="true">
                  <path d="M223.5 32C100 32 0 132.3 0 256s100 224 223.5 224c60.6 0 115.5-24.2 155.8-63.4 5-4.9 6.3-12.5 3.1-18.7s-10.1-9.7-17-8.5c-9.8 1.7-19.8 2.6-30.1 2.6-96.9 0-175.5-78.8-175.5-176 0-65.8 36-123.1 89.3-153.3 6.1-3.5 9.2-10.5 7.7-17.3s-7.3-11.9-14.3-12.5c-6.3-.5-12.6-.8-19-.8z" />
                </svg>
              </span>
              <input
                type="checkbox"
                className="theme-switch-input"
                checked={isDarkMode}
                onChange={(event) => setIsDarkMode(event.target.checked)}
              />
              <span className="theme-switch-slider" />
            </label>

            {session ? (
              <>
                <span className="welcome-chip">
                  <strong>{session.displayName}</strong>
                  <span>{session.roles.includes('Patient') ? 'Paciente' : 'Personal autorizado'}</span>
                </span>
                <button type="button" className="button" onClick={() => void logout()}>
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

      <main className="page-container">
        {children}
      </main>

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