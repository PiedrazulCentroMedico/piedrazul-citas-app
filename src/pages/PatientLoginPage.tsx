import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import loginIllustration from '../assets/login-session.png';

export function PatientLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { authMode, login, loginWithCredentials } = useAuth();
  const [documentNumber, setDocumentNumber] = useState(() => ((location.state as { documentNumber?: string } | undefined)?.documentNumber ?? ''));
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const requestedPath = (location.state as { from?: { pathname?: string } } | undefined)?.from?.pathname;
  const redirectTo = requestedPath?.startsWith('/portal/paciente') ? requestedPath : '/portal/paciente';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    if (!documentNumber.trim() || !password.trim()) {
      setMessage('Ingresa tu número de cédula y tu contraseña para continuar.');
      return;
    }

    try {
      setSubmitting(true);
      if (authMode === 'keycloak') {
        await login('patient');
        return;
      }

      await loginWithCredentials(documentNumber.replace(/\D/g, ''), password, 'patient');
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible iniciar sesión.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="stack-lg">
      <section className="section-card auth-shell">
        <div className="stack-sm auth-copy">
          <span className="eyebrow">Acceso de pacientes</span>
          <h1>Inicia sesión en tu cuenta</h1>
          <div className="login-illustration-inline" aria-hidden="true">
            <img src={loginIllustration} alt="" />
          </div>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Número de cédula <span className="required-star">*</span>
            <input inputMode="numeric" autoComplete="username" value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value.replace(/\D/g, ''))} />
          </label>
          <label>
            Contraseña <span className="required-star">*</span>
            <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <label className="checkbox-inline">
            <input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />
            <span>Mostrar contraseña</span>
          </label>

          {message && <div className="feedback-card error">{message}</div>}

          <button type="submit" className="button" disabled={submitting}>
            {submitting ? 'Ingresando...' : 'Iniciar sesión'}
          </button>

          <div className="auth-links">
            <Link to="/olvide-mi-contrasena">Olvidé mi contraseña</Link>
            <Link to="/crear-cuenta">Crear cuenta</Link>
          </div>
        </form>
      </section>
    </div>
  );
}
