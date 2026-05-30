import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { saveRegisterDraft } from '../utils/sessionStorage';
import { sanitizeNameInput, validateStrongPassword } from '../utils/validators';

export function PatientRegisterPage() {
  const navigate = useNavigate();
  const { authMode, register, registerPatientAccount } = useAuth();

  const [form, setForm] = useState({
    documentNumber: '',
    firstName: '',
    lastName: '',
    password: '',
    confirmPassword: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage(null);
    setFieldErrors((current) => ({ ...current, [field]: false }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    setFieldErrors({});

    if (!/^\d{5,20}$/.test(form.documentNumber.trim())) {
      setFieldErrors({ documentNumber: true });
      setMessage('Ingresa una cédula válida de entre 5 y 20 dígitos.');
      return;
    }

    if (form.firstName.trim().length < 2 || form.lastName.trim().length < 2) {
      setFieldErrors({
        firstName: form.firstName.trim().length < 2,
        lastName: form.lastName.trim().length < 2,
      });
      setMessage('Ingresa nombres y apellidos válidos, usando solo letras.');
      return;
    }

    const passwordValidation = validateStrongPassword(form.password);
    if (!passwordValidation.isValid) {
      setFieldErrors({ password: true });
      setMessage(
        'La contraseña debe tener mínimo 8 caracteres, incluir una mayúscula, una minúscula y al menos un número o carácter especial.'
      );
      return;
    }

    if (form.password !== form.confirmPassword) {
      setFieldErrors({ confirmPassword: true });
      setMessage('La confirmación de la contraseña no coincide.');
      return;
    }

    try {
      setSubmitting(true);

      saveRegisterDraft({
        documentNumber: form.documentNumber.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
      });

      if (authMode === 'keycloak') {
        await register();
        return;
      }

      await registerPatientAccount(form);
      navigate('/portal/paciente/perfil', { replace: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible crear la cuenta.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="stack-lg">
      <section className="section-card auth-shell">
        <div className="stack-sm auth-copy">
          <span className="eyebrow">Nuevo usuario</span>
          <h1>Crea tu cuenta</h1>
          <p className="muted-text">
            La cédula será tu dato de acceso. El correo se completa después y será opcional.
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              Cédula
              <input
                className={fieldErrors.documentNumber ? 'input-error' : ''}
                inputMode="numeric"
                value={form.documentNumber}
                onChange={(event) =>
                  handleChange('documentNumber', event.target.value.replace(/\D/g, ''))
                }
              />
            </label>

            <label>
              Nombres
              <input
                className={fieldErrors.firstName ? 'input-error' : ''}
                value={form.firstName}
                onChange={(event) =>
                  handleChange('firstName', sanitizeNameInput(event.target.value))
                }
              />
            </label>

            <label>
              Apellidos
              <input
                className={fieldErrors.lastName ? 'input-error' : ''}
                value={form.lastName}
                onChange={(event) =>
                  handleChange('lastName', sanitizeNameInput(event.target.value))
                }
              />
            </label>
          </div>

          <label>
            Contraseña
            <input
              className={fieldErrors.password ? 'input-error' : ''}
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={form.password}
              onChange={(event) => handleChange('password', event.target.value)}
            />
            <small className="helper-text">
              Mínimo 8 caracteres, una mayúscula, una minúscula y un número o carácter especial.
            </small>
          </label>

          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(event) => setShowPassword(event.target.checked)}
            />
            <span>Mostrar contraseña</span>
          </label>

          <label>
            Confirmar contraseña
            <input
              className={fieldErrors.confirmPassword ? 'input-error' : ''}
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={(event) => handleChange('confirmPassword', event.target.value)}
            />
          </label>

          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={showConfirmPassword}
              onChange={(event) => setShowConfirmPassword(event.target.checked)}
            />
            <span>Mostrar confirmación</span>
          </label>

          {message && <div className="feedback-card error">{message}</div>}

          <button type="submit" className="button" disabled={submitting}>
            {submitting ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>

          <div className="auth-links">
            <span>¿Ya tienes cuenta?</span>
            <Link to="/iniciar-sesion">Iniciar sesión</Link>
            <Link to="/olvide-mi-contrasena">Olvidé mi contraseña</Link>
          </div>
        </form>
      </section>
    </div>
  );
}