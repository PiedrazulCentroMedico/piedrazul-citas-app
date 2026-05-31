import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/http';
import { useAuth } from '../auth/AuthContext';
import { PortalTabs } from '../components/PortalTabs';
import type { Gender, GenderOption, PatientProfile } from '../types';
import { clearRegisterDraft, readRegisterDraft } from '../utils/sessionStorage';
import { sanitizeNameInput, validatePatientForm, validateStrongPassword } from '../utils/validators';

const tabs = [
  { to: '/portal/paciente', label: 'Mis citas' },
  { to: '/portal/paciente/perfil', label: 'Mi perfil' },
];

const initialProfile = {
  documentNumber: '',
  firstName: '',
  lastName: '',
  phone: '',
  gender: '' as GenderOption,
  birthDate: '',
  email: '',
};

function looksLikeDemoEmail(value?: string | null) {
  if (!value) return false;
  return /(^paciente\.demo@piedrazul\.test$|@piedrazul\.local$)/i.test(value.trim());
}

type ProfileField = keyof typeof initialProfile;

export function PatientProfilePage() {
  const navigate = useNavigate();
  const { authMode, requestPasswordReset, resetPassword, session } = useAuth();
  const [form, setForm] = useState(initialProfile);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ProfileField, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ code: '', password: '', confirmPassword: '' });
  const [passwordCode, setPasswordCode] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordFieldErrors, setPasswordFieldErrors] = useState<Record<string, boolean>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    const draft = readRegisterDraft();
    if (draft) {
      setForm((current) => ({
        ...current,
        documentNumber: current.documentNumber || draft.documentNumber || '',
        firstName: current.firstName || draft.firstName,
        lastName: current.lastName || draft.lastName,
        email: current.email || draft.email || '',
      }));
    }
  }, []);

  useEffect(() => {
    if (!session) return;

    apiRequest<PatientProfile>('/api/patient/profile', session)
      .then((profile) => {
        setForm((current) => ({
          ...current,
          documentNumber: profile.documentNumber,
          firstName: profile.firstName || current.firstName,
          lastName: profile.lastName || current.lastName,
          phone: profile.phone,
          gender: profile.gender,
          birthDate: profile.birthDate ?? '',
          email: looksLikeDemoEmail(profile.email) ? '' : (profile.email ?? ''),
        }));
      })
      .catch(() => undefined);
  }, [session]);

  useEffect(() => {
    if (!showSuccessModal) return undefined;

    const timer = window.setTimeout(() => {
      setShowSuccessModal(false);
      navigate('/portal/paciente', { replace: true });
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [navigate, showSuccessModal]);

  const handleChange = (field: ProfileField, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage(null);
    setFieldErrors((current) => ({ ...current, [field]: false }));
  };

  const validateAndMarkFields = () => {
    const nextErrors: Partial<Record<ProfileField, boolean>> = {};

    if (!/^\d{5,20}$/.test(form.documentNumber.trim())) nextErrors.documentNumber = true;
    if (form.firstName.trim().length < 2) nextErrors.firstName = true;
    if (form.lastName.trim().length < 2) nextErrors.lastName = true;
    if (!/^\d{10}$/.test(form.phone.trim())) nextErrors.phone = true;
    if (!form.gender) nextErrors.gender = true;
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) nextErrors.email = true;
    if (form.birthDate) {
      const birth = new Date(form.birthDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (Number.isNaN(birth.getTime()) || birth > today || birth.getFullYear() < today.getFullYear() - 120) {
        nextErrors.birthDate = true;
      }
    }

    setFieldErrors(nextErrors);
    return nextErrors;
  };

  const handlePasswordFieldChange = (field: keyof typeof passwordForm, value: string) => {
    setPasswordForm((current) => ({ ...current, [field]: value }));
    setPasswordMessage(null);
    setPasswordFieldErrors((current) => ({ ...current, [field]: false }));
  };

  const generateProfilePasswordCode = async () => {
    if (!/^\d{5,20}$/.test(form.documentNumber.trim())) {
      setPasswordMessage('No encontramos tu cédula para generar el código.');
      setPasswordFieldErrors({ code: true });
      return;
    }

    try {
      setPasswordSubmitting(true);
      setPasswordMessage(null);
      if (authMode === 'keycloak') {
        setPasswordMessage('La recuperación de contraseña se realiza desde el proveedor de identidad configurado.');
        return;
      }
      const generatedCode = await requestPasswordReset(form.documentNumber);
      setPasswordCode(generatedCode);
      setPasswordForm((current) => ({ ...current, code: generatedCode ?? '' }));
      setPasswordMessage('Código generado. Ahora escribe tu nueva contraseña y confirma el cambio.');
      setPasswordFieldErrors({});
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : 'No fue posible generar el código.');
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, boolean> = {};
    if (!passwordForm.code.trim()) nextErrors.code = true;
    if (!validateStrongPassword(passwordForm.password).isValid) nextErrors.password = true;
    if (passwordForm.password !== passwordForm.confirmPassword || !passwordForm.confirmPassword) nextErrors.confirmPassword = true;

    setPasswordFieldErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      if (nextErrors.code) setPasswordMessage('Ingresa o genera el código temporal.');
      else if (nextErrors.password) setPasswordMessage('La nueva contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número o carácter especial.');
      else setPasswordMessage('La confirmación de la contraseña no coincide.');
      return;
    }

    try {
      setPasswordSubmitting(true);
      setPasswordMessage(null);
      await resetPassword(form.documentNumber, passwordForm.code, passwordForm.password);
      setPasswordForm({ code: '', password: '', confirmPassword: '' });
      setPasswordCode(null);
      setPasswordFieldErrors({});
      setPasswordMessage('Contraseña actualizada correctamente. En tu próximo ingreso usa la nueva contraseña.');
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No fue posible cambiar la contraseña.';
      setPasswordMessage(text.toLowerCase().includes('código') || text.toLowerCase().includes('codigo') ? 'El código temporal no es correcto o ya venció. Genera uno nuevo e inténtalo otra vez.' : text);
      setPasswordFieldErrors({ code: true });
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const markedErrors = validateAndMarkFields();
    if (!form.gender) {
      setMessage('Selecciona tu género para continuar.');
      return;
    }
    const errors = validatePatientForm(form);
    if (errors.length > 0 || Object.values(markedErrors).some(Boolean)) {
      setMessage(errors[0] ?? 'Revisa los campos señalados en rojo.');
      return;
    }

    try {
      setSubmitting(true);
      await apiRequest<PatientProfile>('/api/patient/profile', session, {
        method: 'PUT',
        body: {
          documentNumber: form.documentNumber,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone: form.phone,
          gender: form.gender as Gender,
          birthDate: form.birthDate || null,
          email: form.email.trim() || null,
        },
      });
      clearRegisterDraft();
      setMessage(null);
      setFieldErrors({});
      setShowSuccessModal(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible guardar el perfil.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="stack-lg">
      <section className="section-card">
        <h1>Mi perfil</h1>
        <p className="muted-text">Completa o actualiza tus datos para agilizar futuras reservas.</p>
      </section>

      <PortalTabs items={tabs} />

      <form className="section-card stack-md" onSubmit={handleSubmit} noValidate>
        <div className="form-grid">
          <label>
            Documento
            <input className={fieldErrors.documentNumber ? 'input-error' : ''} inputMode="numeric" maxLength={20} value={form.documentNumber} disabled readOnly />
            <small className="helper-text">La cédula solo puede cambiarla el administrador.</small>
          </label>
          <label>
            Nombres
            <input className={fieldErrors.firstName ? 'input-error' : ''} maxLength={80} value={form.firstName} onChange={(event) => handleChange('firstName', sanitizeNameInput(event.target.value))} />
          </label>
          <label>
            Apellidos
            <input className={fieldErrors.lastName ? 'input-error' : ''} maxLength={80} value={form.lastName} onChange={(event) => handleChange('lastName', sanitizeNameInput(event.target.value))} />
          </label>
          <label>
            Celular
            <input className={fieldErrors.phone ? 'input-error' : ''} inputMode="numeric" maxLength={15} value={form.phone} onChange={(event) => handleChange('phone', event.target.value.replace(/\D/g, ''))} />
          </label>
          <label>
            Género
            <select className={fieldErrors.gender ? 'input-error' : ''} value={form.gender} onChange={(event) => handleChange('gender', event.target.value)}>
              <option value="">Seleccionar género</option>
              <option value="Female">Mujer</option>
              <option value="Male">Hombre</option>
              <option value="Other">Otro</option>
            </select>
          </label>
          <label>
            Fecha de nacimiento
            <input className={fieldErrors.birthDate ? 'input-error' : ''} type="date" value={form.birthDate} onChange={(event) => handleChange('birthDate', event.target.value)} />
          </label>
          <label className="span-two">
            Correo electrónico
            <input className={fieldErrors.email ? 'input-error' : ''} type="email" maxLength={150} value={form.email} placeholder="Opcional" onChange={(event) => handleChange('email', event.target.value)} />
          </label>
        </div>

        {!form.email.trim() && (
          <div className="feedback-card warning">
            Aún no has registrado correo electrónico. Es opcional, pero puedes agregarlo para recibir notificaciones.
          </div>
        )}

        {message && <div className="feedback-card error">{message}</div>}

        <div className="inline-actions end">
          <button type="submit" className="button" disabled={submitting}>
            {submitting ? 'Guardando...' : 'Guardar perfil'}
          </button>
        </div>
      </form>

      <form className="section-card stack-md" onSubmit={handlePasswordSubmit} noValidate>
        <h2>Cambiar contraseña</h2>
        <p className="muted-text">Genera un código temporal aquí mismo y define una nueva contraseña sin salir de tu perfil.</p>

        <div className="inline-actions wrap">
          <button type="button" className="button button-secondary" onClick={() => void generateProfilePasswordCode()} disabled={passwordSubmitting}>
            {passwordSubmitting ? 'Procesando...' : 'Generar código temporal'}
          </button>
          {passwordCode && <span className="summary-badge">Código temporal: {passwordCode}</span>}
        </div>

        <div className="form-grid">
          <label>
            Código temporal
            <input className={passwordFieldErrors.code ? 'input-error' : ''} value={passwordForm.code} onChange={(event) => handlePasswordFieldChange('code', event.target.value)} />
            <small className="helper-text">Si el código no coincide, se marcará este campo para que puedas corregirlo.</small>
          </label>
          <label>
            Nueva contraseña
            <div className="password-input-row">
              <input className={passwordFieldErrors.password ? 'input-error' : ''} type={showPassword ? 'text' : 'password'} value={passwordForm.password} onChange={(event) => handlePasswordFieldChange('password', event.target.value)} />
              <button type="button" className="button button-secondary password-toggle-button" onClick={() => setShowPassword((current) => !current)}>{showPassword ? 'Ocultar' : 'Mostrar'}</button>
            </div>
          </label>
          <label>
            Confirmar contraseña
            <div className="password-input-row">
              <input className={passwordFieldErrors.confirmPassword ? 'input-error' : ''} type={showConfirmPassword ? 'text' : 'password'} value={passwordForm.confirmPassword} onChange={(event) => handlePasswordFieldChange('confirmPassword', event.target.value)} />
              <button type="button" className="button button-secondary password-toggle-button" onClick={() => setShowConfirmPassword((current) => !current)}>{showConfirmPassword ? 'Ocultar' : 'Mostrar'}</button>
            </div>
          </label>
        </div>

        {passwordMessage && <div className={`feedback-card ${passwordMessage.includes('correctamente') || passwordMessage.includes('generado') ? 'success' : 'error'}`}>{passwordMessage}</div>}

        <div className="inline-actions end">
          <button type="submit" className="button" disabled={passwordSubmitting}>
            {passwordSubmitting ? 'Actualizando...' : 'Guardar nueva contraseña'}
          </button>
        </div>
      </form>

      {showSuccessModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-card stack-md">
            <span className="eyebrow">Perfil actualizado</span>
            <h2>Perfil correctamente guardado</h2>
            <p className="muted-text">Tus datos fueron guardados. En unos segundos te llevaremos a la sección principal del paciente.</p>
          </section>
        </div>
      )}
    </div>
  );
}
