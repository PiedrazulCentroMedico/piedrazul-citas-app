import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import loginIllustration from '../assets/login-session.png';

function getInternalLandingPath(roles: string[]) {
  if (roles.includes('Scheduler')) return '/portal/interno/nueva-cita';
  if (roles.includes('Doctor')) return '/portal/interno/citas';
  return '/portal/interno/citas';
}

export function InternalLoginPage() {
  const navigate = useNavigate();
  const { authMode, login, loginWithCredentials } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);


  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setMessage('Ingresa tu correo corporativo y tu contraseña.');
      return;
    }

    try {
      setSubmitting(true);
      if (authMode === 'keycloak') {
        await login('internal');
        return;
      }

      const loggedSession = await loginWithCredentials(cleanEmail, cleanPassword, 'internal');
      navigate(getInternalLandingPath(loggedSession.roles), { replace: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible iniciar sesión en el portal interno.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="stack-lg">
      <section className="section-card auth-shell">
        <div className="stack-sm auth-copy">
          <span className="eyebrow">Acceso interno</span>
          <h1>Portal del personal autorizado</h1>
          <div className="login-illustration-inline" aria-hidden="true"><img src={loginIllustration} alt="" /></div>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Correo corporativo <span className="required-star">*</span>
            <input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value.replace(/\s/g, '').toLowerCase())} placeholder="usuario@piedrazul.local" />
          </label>
          <label>
            Contraseña <span className="required-star">*</span>
            <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} onBlur={(event) => setPassword(event.target.value.trim())} />
          </label>
          <div className="between wrap password-login-actions internal-password-actions">
            <label className="checkbox-inline">
              <input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />
              <span>Mostrar contraseña</span>
            </label>
            <Link className="forgot-password-link" to="/olvide-mi-contrasena">Olvidé mi contraseña</Link>
          </div>

          {message && <div className="feedback-card error">{message}</div>}

          <button type="submit" className="button" disabled={submitting}>
            {submitting ? 'Validando acceso...' : 'Ingresar al portal interno'}
          </button>

          {authMode === 'demo' && (
            <div className="notice-card stack-sm">
              <strong>Credenciales de prueba</strong>
              <span className="muted-text">Administrador: admin@piedrazul.local / Admin123*</span>
              <span className="muted-text">Agendador: agenda@piedrazul.local / Agenda123*</span>
              <span className="muted-text">Laura Rivera: laura@piedrazul.local / Laura123*</span>
              <span className="muted-text">Andres Vega: andres@piedrazul.local / Andres123*</span>
            </div>
          )}

          <div className="auth-links">
            <Link to="/iniciar-sesion">Ir al portal de pacientes</Link>
          </div>
        </form>
      </section>
    </div>
  );
}
