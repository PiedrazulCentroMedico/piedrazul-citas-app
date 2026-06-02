import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { validateStrongPassword } from '../utils/validators';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { resetPassword } = useAuth();
  const [form, setForm] = useState({ identifier: '', code: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{5,20}$/.test(form.identifier.trim())) {
      setMessage('Ingresa tu número de cédula.');
      return;
    }
    if (!form.code.trim()) {
      setMessage('Ingresa el código de recuperación.');
      return;
    }
    if (!validateStrongPassword(form.password).isValid) {
      setMessage('La nueva contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número o carácter especial.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setMessage('La confirmación de la contraseña no coincide.');
      return;
    }

    try {
      setSubmitting(true);
      await resetPassword(form.identifier, form.code, form.password);
      navigate('/iniciar-sesion', { replace: true, state: { resetDone: true } });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible restablecer la contraseña.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="stack-lg">
      <section className="section-card auth-shell">
        <div className="stack-sm auth-copy">
          <span className="eyebrow">Nueva contraseña</span>
          <h1>Restablece tu acceso</h1>
          <p className="muted-text">Usa el código temporal generado previamente y define una nueva contraseña segura.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Número de cédula <span className="required-star">*</span>
            <input inputMode="numeric" value={form.identifier} onChange={(event) => handleChange('identifier', event.target.value.replace(/\D/g, ''))} />
          </label>
          <label>
            Código temporal <span className="required-star">*</span>
            <input value={form.code} onChange={(event) => handleChange('code', event.target.value)} />
          </label>
          <label>
            Nueva contraseña <span className="required-star">*</span>
            <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={(event) => handleChange('password', event.target.value)} />
          </label>
          <label className="checkbox-inline">
            <input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />
            <span>Mostrar nueva contraseña</span>
          </label>
          <label>
            Confirmar contraseña <span className="required-star">*</span>
            <input type={showConfirmPassword ? 'text' : 'password'} value={form.confirmPassword} onChange={(event) => handleChange('confirmPassword', event.target.value)} />
          </label>
          <label className="checkbox-inline">
            <input type="checkbox" checked={showConfirmPassword} onChange={(event) => setShowConfirmPassword(event.target.checked)} />
            <span>Mostrar confirmación</span>
          </label>

          {message && <div className="feedback-card error">{message}</div>}

          <button type="submit" className="button" disabled={submitting}>
            {submitting ? 'Actualizando...' : 'Guardar nueva contraseña'}
          </button>

          <div className="auth-links">
            <Link to="/olvide-mi-contrasena">Generar otro código</Link>
            <Link to="/iniciar-sesion">Volver a iniciar sesión</Link>
          </div>
        </form>
      </section>
    </div>
  );
}
