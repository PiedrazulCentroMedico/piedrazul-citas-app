import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function ForgotPasswordPage() {
  const { authMode, requestPasswordReset } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{5,20}$/.test(identifier.trim())) {
      setMessage('Ingresa tu número de cédula para generar el código de recuperación.');
      return;
    }

    try {
      setSubmitting(true);
      if (authMode === 'keycloak') {
        setMessage('La recuperación de contraseña se realiza desde el proveedor de identidad configurado.');
        return;
      }
      const generatedCode = await requestPasswordReset(identifier);
      setCode(generatedCode);
      setMessage('Se generó un código temporal de recuperación. Úsalo para restablecer tu contraseña.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible iniciar la recuperación.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="stack-lg">
      <section className="section-card auth-shell">
        <div className="stack-sm auth-copy">
          <span className="eyebrow">Recuperación</span>
          <h1>¿Olvidaste tu contraseña?</h1>
          <p className="muted-text">Ingresa tu número de cédula y genera un código temporal para restablecer tu acceso.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Número de cédula <span className="required-star">*</span>
            <input inputMode="numeric" value={identifier} onChange={(event) => setIdentifier(event.target.value.replace(/\D/g, ''))} />
          </label>

          {message && <div className={`feedback-card ${code ? 'success' : 'error'}`}>{message}</div>}
          {code && (
            <div className="notice-card stack-sm">
              <strong>Código temporal: {code}</strong>
              <span className="muted-text">En modo demo este código se muestra en pantalla. Expira en 15 minutos.</span>
            </div>
          )}

          <button type="submit" className="button" disabled={submitting}>
            {submitting ? 'Generando...' : 'Generar código'}
          </button>

          <div className="auth-links">
            <Link to="/restablecer-contrasena">Ya tengo un código</Link>
            <Link to="/iniciar-sesion">Volver a iniciar sesión</Link>
          </div>
        </form>
      </section>
    </div>
  );
}
