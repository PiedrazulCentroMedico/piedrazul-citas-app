import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api/http';
import { useAuth } from '../auth/AuthContext';
import { PortalTabs } from '../components/PortalTabs';
import type { ProviderSchedule, ProviderSchedulePayload } from '../types';
import { getLinkedProviderId, linkDefaultSeededDoctors } from '../utils/sessionStorage';
import { sanitizeNameInput } from '../utils/validators';

export function InternalProfilePage() {
  const { session } = useAuth();
  const [schedule, setSchedule] = useState<ProviderSchedule | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({ firstName: '', lastName: '', specialty: '', defaultSlotIntervalMinutes: 30 });

  const tabs = useMemo(() => ([
    { to: '/portal/interno/citas', label: 'Mis citas' },
    { to: '/portal/interno/configuracion', label: 'Configuración' },
    { to: '/portal/interno/perfil', label: 'Mi perfil' },
  ]), []);

  useEffect(() => {
    if (!session) return;

    apiRequest<ProviderSchedule[]>('/api/admin/provider-schedules', session)
      .then((items) => {
        linkDefaultSeededDoctors(items);
        const linkedProviderId = getLinkedProviderId(session.email);
        if (!linkedProviderId) {
          setMessage('No encontramos un perfil profesional asociado a tu cuenta. Pide al administrador que te vincule a un profesional.');
          return;
        }
        const found = items.find((item) => item.providerId === linkedProviderId) ?? null;
        if (!found) {
          setMessage('No encontramos tu perfil profesional en el sistema.');
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
      })
      .catch((error: Error) => setMessage(error.message));
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
            Correo corporativo
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
    </div>
  );
}
