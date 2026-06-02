import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function InternalLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { authMode, login, loginWithCredentials } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const requestedPath = (location.state as { from?: { pathname?: string } } | undefined)?.from?.pathname;
  const redirectTo = requestedPath?.startsWith('/portal/interno') ? requestedPath : '/portal/interno/citas';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password.trim()) {
      setMessage('Ingresa tu usuario corporativo y tu contraseña.');
      return;
    }

    try {
      setSubmitting(true);
      if (authMode === 'keycloak') {
        await login('internal');
        return;
      }

      await loginWithCredentials(email, password, 'internal');
      navigate(redirectTo, { replace: true });
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
          <p className="muted-text">El acceso interno es independiente del portal del paciente. La interfaz visible depende del rol asociado a tus credenciales.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Correo corporativo <span className="required-star">*</span>
            <input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Contraseña <span className="required-star">*</span>
            <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <div className="between wrap password-login-actions">
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
              <span className="muted-text">Profesional general: medico@piedrazul.local / Medico123*</span>
              <span className="muted-text">Ana Gómez: ana@piedrazul.local / Ana123*</span>
              <span className="muted-text">Laura Rivera: laura@piedrazul.local / Laura123*</span>
              <span className="muted-text">Carlos Martínez: carlos@piedrazul.local / Carlos123*</span>
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
