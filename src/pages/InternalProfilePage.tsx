import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api/http';
import { useAuth } from '../auth/AuthContext';
import { PortalTabs } from '../components/PortalTabs';
import type { ProviderSchedule, ProviderSchedulePayload } from '../types';
import { getLinkedProviderId, linkDefaultSeededDoctors } from '../utils/sessionStorage';
import { demoProviderSchedules } from '../utils/demoProviders';
import { sanitizeNameInput } from '../utils/validators';

function normalizeText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

export function InternalProfilePage() {
  const { session, changeOwnPassword } = useAuth();
  const [schedule, setSchedule] = useState<ProviderSchedule | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({ firstName: '', lastName: '', specialty: '', defaultSlotIntervalMinutes: 30 });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  const tabs = useMemo(() => ([
    { to: '/portal/interno/citas', label: 'Mis citas' },
    { to: '/portal/interno/configuracion', label: 'Configuración' },
    { to: '/portal/interno/perfil', label: 'Mi perfil' },
  ]), []);

  useEffect(() => {
    if (!session) return;

    const hydrateProfile = (items: ProviderSchedule[], showOfflineNotice = false) => {
      linkDefaultSeededDoctors(items);
      const linkedProviderId = getLinkedProviderId(session.email);
      const normalizedDisplayName = normalizeText(session.displayName ?? '');
      const found = items.find((item) => item.providerId === linkedProviderId)
        ?? items.find((item) => normalizeText(item.providerName).includes(normalizedDisplayName) || normalizedDisplayName.includes(normalizeText(item.providerName)))
        ?? items[0]
        ?? null;
      if (!found) {
        setMessage('Estamos cargando tu información profesional. Si no aparece, pide al administrador que revise tu vinculación.');
        return;
      }
      setSchedule(found);
      const [firstName, ...rest] = found.providerName.split(' ');
      setForm({
        firstName,
        lastName: rest.join(' '),
        specialty: found.specialty,
        defaultSlotIntervalMinutes: found.defaultSlotIntervalMinutes,
      });
      if (showOfflineNotice) setMessage('Se muestra tu perfil demo mientras reinicias la API.');
    };

    apiRequest<ProviderSchedule[]>('/api/admin/provider-schedules', session)
      .then((items) => hydrateProfile(items))
      .catch(() => hydrateProfile(demoProviderSchedules, true));
  }, [session]);

  const updateForm = (field: keyof typeof form, value: string | number) => {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage(null);
    setFieldErrors((current) => ({ ...current, [field]: false }));
  };

  const saveProfile = async () => {
    if (!schedule) return;
    const nextErrors = {
      firstName: form.firstName.trim().length < 2,
      lastName: form.lastName.trim().length < 2,
      specialty: form.specialty.trim().length < 2,
    };
    setFieldErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      setMessage('Revisa los campos señalados en rojo. Nombres, apellidos y especialidad son obligatorios.');
      return;
    }

    try {
      setSubmitting(true);
      const payload: ProviderSchedulePayload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        specialty: form.specialty.trim(),
        defaultSlotIntervalMinutes: form.defaultSlotIntervalMinutes,
        weeklyAvailabilities: schedule.weeklyAvailabilities,
      };
      const result = await apiRequest<ProviderSchedule>(`/api/admin/provider-schedules/${schedule.providerId}`, session, {
        method: 'PUT',
        body: payload,
      });
      setSchedule(result);
      setMessage('Tu perfil profesional fue actualizado correctamente.');
      setFieldErrors({});
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos guardar tu perfil profesional.');
    } finally {
      setSubmitting(false);
    }
  };


  const updatePasswordForm = (field: keyof typeof passwordForm, value: string) => {
    setPasswordForm((current) => ({ ...current, [field]: value }));
    setPasswordMessage(null);
  };

  const savePassword = async () => {
    const currentPassword = passwordForm.currentPassword.trim();
    const newPassword = passwordForm.newPassword.trim();
    const confirmPassword = passwordForm.confirmPassword.trim();

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordMessage('Completa la contraseña actual, la nueva contraseña y la confirmación.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage('La nueva contraseña y la confirmación no coinciden.');
      return;
    }

    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(newPassword)) {
      setPasswordMessage('La nueva contraseña debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número.');
      return;
    }

    try {
      setChangingPassword(true);
      await changeOwnPassword(currentPassword, newPassword);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordMessage('Tu contraseña fue actualizada correctamente.');
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : 'No pudimos cambiar la contraseña.');
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="stack-lg">
      <section className="section-card">
        <h1>Mi perfil profesional</h1>
        <p className="muted-text">Actualiza tus datos visibles para el equipo interno. Tu agenda se gestiona desde la sección de configuración.</p>
      </section>

      <PortalTabs items={tabs} />

      <section className="section-card stack-md">
        <div className="form-grid">
          <label>
            Correo corporativo <span className="required-star">*</span>
            <input value={session?.email ?? ''} disabled />
          </label>
          <label>
            Rol
            <input value="Profesional de salud" disabled />
          </label>
          <label>
            Nombres
            <input className={fieldErrors.firstName ? 'input-error' : ''} value={form.firstName} onChange={(event) => updateForm('firstName', sanitizeNameInput(event.target.value))} />
          </label>
          <label>
            Apellidos
            <input className={fieldErrors.lastName ? 'input-error' : ''} value={form.lastName} onChange={(event) => updateForm('lastName', sanitizeNameInput(event.target.value))} />
          </label>
          <label>
            Especialidad
            <input className={fieldErrors.specialty ? 'input-error' : ''} value={form.specialty} onChange={(event) => updateForm('specialty', event.target.value)} />
          </label>
        </div>

        {message && <div className={`feedback-card ${message.includes('correctamente') ? 'success' : 'error'}`}>{message}</div>}

        <div className="inline-actions end">
          <button type="button" className="button" onClick={() => void saveProfile()} disabled={submitting || !schedule}>
            {submitting ? 'Guardando...' : 'Guardar perfil'}
          </button>
        </div>
      </section>

      <section className="section-card stack-md">
        <div>
          <span className="eyebrow">Seguridad</span>
          <h2>Cambiar contraseña</h2>
          <p className="muted-text">Actualiza tu clave de acceso al portal interno. Se eliminarán espacios al inicio y al final para evitar errores al iniciar sesión.</p>
        </div>

        <div className="form-grid">
          <label>
            Contraseña actual <span className="required-star">*</span>
            <input
              type="password"
              value={passwordForm.currentPassword}
              onChange={(event) => updatePasswordForm('currentPassword', event.target.value)}
              autoComplete="current-password"
            />
          </label>
          <label>
            Nueva contraseña <span className="required-star">*</span>
            <input
              type="password"
              value={passwordForm.newPassword}
              onChange={(event) => updatePasswordForm('newPassword', event.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label>
            Confirmar contraseña <span className="required-star">*</span>
            <input
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(event) => updatePasswordForm('confirmPassword', event.target.value)}
              autoComplete="new-password"
            />
          </label>
        </div>

        {passwordMessage && <div className={`feedback-card ${passwordMessage.includes('correctamente') ? 'success' : 'error'}`}>{passwordMessage}</div>}

        <div className="inline-actions end">
          <button type="button" className="button secondary" onClick={() => void savePassword()} disabled={changingPassword}>
            {changingPassword ? 'Actualizando...' : 'Cambiar contraseña'}
          </button>
        </div>
      </section>
    </div>
  );
}
