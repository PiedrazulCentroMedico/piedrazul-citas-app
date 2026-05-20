import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../api/http';
import { useAuth } from '../auth/AuthContext';
import { PortalTabs } from '../components/PortalTabs';
import type { CreateDoctorPayload, ProviderSchedule, ProviderSchedulePayload, SystemSettings, WeeklyAvailability } from '../types';
import { linkDoctorToProvider, getLinkedProviderId } from '../utils/sessionStorage';
import { hasSettingsAccess, isDoctorRole, sanitizeNameInput, validateAvailabilityEntries, validateStrongPassword } from '../utils/validators';

const dayOptions = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
];

const dayMap: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
  Domingo: 0,
  Lunes: 1,
  Martes: 2,
  Miércoles: 3,
  Jueves: 4,
  Viernes: 5,
  Sábado: 6,
};

const specialtyOptions = ['Medicina General', 'Psicología', 'Terapia Física', 'Quiropráctico'];

const emptyAvailability = (): WeeklyAvailability => ({
  dayOfWeek: 1,
  startTime: '08:00',
  endTime: '12:00',
  slotIntervalMinutes: 30,
  isActive: true,
});

const emptyDoctorForm = (): CreateDoctorPayload => ({
  firstName: '',
  lastName: '',
  specialty: specialtyOptions[0],
  defaultSlotIntervalMinutes: 30,
  email: '',
  password: '',
});

function normalizeDayOfWeek(value: number | string) {
  if (typeof value === 'number') return value;
  return dayMap[value] ?? 1;
}

function normalizeSchedule(schedule: ProviderSchedule): ProviderSchedule {
  return {
    ...schedule,
    weeklyAvailabilities: schedule.weeklyAvailabilities.map((item) => ({
      ...item,
      dayOfWeek: normalizeDayOfWeek(item.dayOfWeek),
    })),
  };
}

export function AdminSchedulesPage() {
  const { session, createInternalDemoAccount } = useAuth();
  const isDoctor = isDoctorRole(session?.roles ?? []);
  const [settings, setSettings] = useState<SystemSettings>({ weeksAheadBooking: 6, timeZoneId: 'America/Bogota' });
  const [schedules, setSchedules] = useState<ProviderSchedule[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [providerForm, setProviderForm] = useState<ProviderSchedulePayload>({
    firstName: '',
    lastName: '',
    specialty: specialtyOptions[0],
    defaultSlotIntervalMinutes: 30,
    weeklyAvailabilities: [emptyAvailability()],
  });
  const [doctorForm, setDoctorForm] = useState<CreateDoctorPayload>(emptyDoctorForm());
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [providerMessage, setProviderMessage] = useState<string | null>(null);
  const [doctorMessage, setDoctorMessage] = useState<string | null>(null);

  const tabs = useMemo(() => {
    const items = [{ to: '/portal/interno/citas', label: isDoctor ? 'Mis citas' : 'Listado de citas' }];
    if (!isDoctor) items.push({ to: '/portal/interno/nueva-cita', label: 'Nueva cita' });
    if (session?.roles.includes('Admin')) items.push({ to: '/portal/interno/usuarios', label: 'Usuarios' });
    if (hasSettingsAccess(session?.roles ?? [])) items.push({ to: '/portal/interno/configuracion', label: 'Configuración' });
    if (isDoctor) items.push({ to: '/portal/interno/perfil', label: 'Mi perfil' });
    return items;
  }, [isDoctor, session?.roles]);

  useEffect(() => {
    if (!session) return;

    Promise.all([
      apiRequest<SystemSettings>('/api/admin/settings', session),
      apiRequest<ProviderSchedule[]>('/api/admin/provider-schedules', session),
    ])
      .then(([settingsData, schedulesData]) => {
        setSettings(settingsData);
        const normalizedSchedules = schedulesData.map(normalizeSchedule);
        setSchedules(normalizedSchedules);
        if (isDoctor) {
          const linked = getLinkedProviderId(session.email);
          if (linked) setSelectedProviderId(linked);
        } else if (normalizedSchedules[0]) {
          setSelectedProviderId(normalizedSchedules[0].providerId);
        }
      })
      .catch((error: Error) => setProviderMessage(error.message));
  }, [isDoctor, session]);

  const selectedProvider = useMemo(
    () => schedules.find((schedule) => schedule.providerId === selectedProviderId) ?? null,
    [schedules, selectedProviderId],
  );

  useEffect(() => {
    if (!selectedProvider) return;
    const [firstName, ...lastNames] = selectedProvider.providerName.split(' ');
    setProviderForm({
      firstName,
      lastName: lastNames.join(' '),
      specialty: selectedProvider.specialty,
      defaultSlotIntervalMinutes: selectedProvider.defaultSlotIntervalMinutes,
      weeklyAvailabilities: selectedProvider.weeklyAvailabilities.length > 0
        ? selectedProvider.weeklyAvailabilities.map((item) => ({ ...item, dayOfWeek: normalizeDayOfWeek(item.dayOfWeek) }))
        : [emptyAvailability()],
    });
  }, [selectedProvider]);

  const updateAvailability = (index: number, field: keyof WeeklyAvailability, value: string | boolean | number) => {
    setProviderForm((current) => ({
      ...current,
      weeklyAvailabilities: current.weeklyAvailabilities.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
    }));
    setProviderMessage(null);
  };

  const saveSettings = async () => {
    try {
      const result = await apiRequest<SystemSettings>('/api/admin/settings', session, {
        method: 'PUT',
        body: settings,
      });
      setSettings(result);
      setSettingsMessage('Los parámetros generales se guardaron correctamente.');
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : 'No pudimos guardar la configuración general.');
    }
  };

  const saveProvider = async () => {
    if (!selectedProviderId) {
      setProviderMessage('Selecciona un profesional antes de guardar la disponibilidad.');
      return;
    }

    if (!providerForm.firstName.trim() || !providerForm.lastName.trim()) {
      setProviderMessage('Los nombres y apellidos del profesional son obligatorios.');
      return;
    }

    if (providerForm.weeklyAvailabilities.length === 0) {
      setProviderMessage('Debes dejar al menos una franja configurada.');
      return;
    }

    const availabilityErrors = validateAvailabilityEntries(providerForm.weeklyAvailabilities);
    if (availabilityErrors.length > 0) {
      setProviderMessage(availabilityErrors[0]);
      return;
    }

    try {
      const payload: ProviderSchedulePayload = {
        firstName: providerForm.firstName.trim(),
        lastName: providerForm.lastName.trim(),
        specialty: providerForm.specialty.trim(),
        defaultSlotIntervalMinutes: providerForm.defaultSlotIntervalMinutes,
        weeklyAvailabilities: providerForm.weeklyAvailabilities.map(({ dayOfWeek, startTime, endTime, slotIntervalMinutes, isActive }) => ({
          dayOfWeek,
          startTime,
          endTime,
          slotIntervalMinutes,
          isActive,
        })),
      };

      const result = normalizeSchedule(await apiRequest<ProviderSchedule>(`/api/admin/provider-schedules/${selectedProviderId}`, session, {
        method: 'PUT',
        body: payload,
      }));
      setSchedules((current) => current.map((item) => (item.providerId === result.providerId ? result : item)));
      setProviderForm({
        firstName: payload.firstName,
        lastName: payload.lastName,
        specialty: payload.specialty,
        defaultSlotIntervalMinutes: payload.defaultSlotIntervalMinutes,
        weeklyAvailabilities: payload.weeklyAvailabilities.map((item) => ({ ...item })),
      });
      setProviderMessage('La disponibilidad del profesional se actualizó correctamente.');
    } catch (error) {
      setProviderMessage(error instanceof Error ? error.message : 'No pudimos guardar la disponibilidad del profesional.');
    }
  };


  const deleteProvider = async () => {
    if (!session || !selectedProviderId) return;
    const confirmed = window.confirm('¿Deseas eliminar este profesional? Esta acción desactiva su agenda y elimina el perfil del médico.');
    if (!confirmed) return;

    try {
      await apiRequest(`/api/admin/provider-schedules/${selectedProviderId}`, session, { method: 'DELETE' });
      setSchedules((current) => current.filter((item) => item.providerId !== selectedProviderId));
      setSelectedProviderId('');
      setProviderMessage('El profesional fue eliminado correctamente.');
    } catch (error) {
      setProviderMessage(error instanceof Error ? error.message : 'No fue posible eliminar el profesional.');
    }
  };

  const createDoctor = async () => {
    if (!doctorForm.firstName.trim() || !doctorForm.lastName.trim() || !doctorForm.specialty.trim() || !doctorForm.email.trim() || !doctorForm.password.trim()) {
      setDoctorMessage('Completa nombres, apellidos, especialidad, correo y contraseña para crear el perfil médico.');
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(doctorForm.email.trim())) {
      setDoctorMessage('Ingresa un correo corporativo válido.');
      return;
    }

    const passwordValidation = validateStrongPassword(doctorForm.password);
    if (!passwordValidation.isValid) {
      setDoctorMessage('La contraseña debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número o carácter especial.');
      return;
    }

    try {
      const schedulePayload: ProviderSchedulePayload = {
        firstName: doctorForm.firstName.trim(),
        lastName: doctorForm.lastName.trim(),
        specialty: doctorForm.specialty.trim(),
        defaultSlotIntervalMinutes: doctorForm.defaultSlotIntervalMinutes,
        weeklyAvailabilities: [emptyAvailability()],
      };

      const provider = normalizeSchedule(await apiRequest<ProviderSchedule>('/api/admin/provider-schedules', session, {
        method: 'POST',
        body: schedulePayload,
      }));
      setSchedules((current) => [...current, provider]);
      linkDoctorToProvider(doctorForm.email.trim(), provider.providerId);
      createInternalDemoAccount({
        email: doctorForm.email.trim(),
        password: doctorForm.password,
        displayName: `${doctorForm.firstName.trim()} ${doctorForm.lastName.trim()}`,
        roles: ['Doctor'],
      });
      setDoctorForm(emptyDoctorForm());
      setDoctorMessage('El perfil médico se creó correctamente y quedó listo para iniciar sesión.');
    } catch (error) {
      setDoctorMessage(error instanceof Error ? error.message : 'No fue posible crear el perfil médico.');
    }
  };

  return (
    <div className="stack-lg">
      <section className="section-card">
        <h1>{isDoctor ? 'Mi configuración de agenda' : 'Configuración del portal interno'}</h1>
        <p className="muted-text">{isDoctor ? 'Edita tus horarios de atención y mantén tu configuración al día.' : 'Ajusta la ventana de tiempo habilitada y define los horarios por profesional.'}</p>
      </section>

      <PortalTabs items={tabs} />

      {!isDoctor && (
        <section className="section-card stack-md">
          <h2>Parámetros generales</h2>
          <div className="form-grid internal-filter-grid">
            <label>
              Semanas habilitadas para reservas
              <input type="number" min={1} max={24} value={settings.weeksAheadBooking} onChange={(event) => setSettings((current) => ({ ...current, weeksAheadBooking: Number(event.target.value) }))} />
            </label>
            <div className="inline-actions end align-end">
              <button type="button" className="button" onClick={() => void saveSettings()}>Guardar parámetros</button>
            </div>
          </div>
          {settingsMessage && <div className={`feedback-card ${settingsMessage.includes('correctamente') ? 'success' : 'error'}`}>{settingsMessage}</div>}
        </section>
      )}

      {!isDoctor && (
        <section className="section-card stack-md">
          <h2>Crear nuevo perfil médico</h2>
          <div className="form-grid">
            <label>
              Nombres
              <input value={doctorForm.firstName} onChange={(event) => setDoctorForm((current) => ({ ...current, firstName: sanitizeNameInput(event.target.value) }))} />
            </label>
            <label>
              Apellidos
              <input value={doctorForm.lastName} onChange={(event) => setDoctorForm((current) => ({ ...current, lastName: sanitizeNameInput(event.target.value) }))} />
            </label>
            <label>
              Especialidad
              <select value={doctorForm.specialty} onChange={(event) => setDoctorForm((current) => ({ ...current, specialty: event.target.value }))}>
                {specialtyOptions.map((specialty) => (
                  <option key={specialty} value={specialty}>{specialty}</option>
                ))}
              </select>
            </label>
            <label>
              Correo corporativo
              <input type="email" value={doctorForm.email} onChange={(event) => setDoctorForm((current) => ({ ...current, email: event.target.value }))} />
            </label>
            <label className="span-two">
              Contraseña inicial
              <input type="password" value={doctorForm.password} onChange={(event) => setDoctorForm((current) => ({ ...current, password: event.target.value }))} />
              <small className="helper-text">Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número o carácter especial.</small>
            </label>
          </div>
          {doctorMessage && <div className={`feedback-card ${doctorMessage.includes('correctamente') ? 'success' : 'error'}`}>{doctorMessage}</div>}
          <div className="inline-actions end">
            <button type="button" className="button" onClick={() => void createDoctor()}>Crear perfil médico</button>
          </div>
        </section>
      )}

      <section className="section-card stack-md">
        <h2>{isDoctor ? 'Mi disponibilidad' : 'Disponibilidad por profesional'}</h2>
        <div className="form-grid internal-filter-grid">
          <label>
            Profesional
            <select value={selectedProviderId} onChange={(event) => setSelectedProviderId(event.target.value)} disabled={isDoctor}>
              <option value="">Selecciona una opción</option>
              {schedules.map((schedule) => (
                <option key={schedule.providerId} value={schedule.providerId}>{schedule.providerName} - {schedule.specialty}</option>
              ))}
            </select>
          </label>
        </div>

        {selectedProvider && (
          <>
            <div className="form-grid">
              <label>
                Nombres
                <input value={providerForm.firstName} onChange={(event) => setProviderForm((current) => ({ ...current, firstName: sanitizeNameInput(event.target.value) }))} />
              </label>
              <label>
                Apellidos
                <input value={providerForm.lastName} onChange={(event) => setProviderForm((current) => ({ ...current, lastName: sanitizeNameInput(event.target.value) }))} />
              </label>
              <label className="span-two">
                Especialidad
                <select value={providerForm.specialty} onChange={(event) => setProviderForm((current) => ({ ...current, specialty: event.target.value }))}>
                  {specialtyOptions.map((specialty) => (
                    <option key={specialty} value={specialty}>{specialty}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="stack-md">
              {providerForm.weeklyAvailabilities.map((availability, index) => (
                <div key={`${index}-${availability.startTime}-${availability.endTime}`} className="availability-row">
                  <label>
                    Día
                    <select value={availability.dayOfWeek} onChange={(event) => updateAvailability(index, 'dayOfWeek', Number(event.target.value))}>
                      {dayOptions.map((day) => (<option key={day.value} value={day.value}>{day.label}</option>))}
                    </select>
                  </label>
                  <label>
                    Inicio
                    <input type="time" value={availability.startTime} onChange={(event) => updateAvailability(index, 'startTime', event.target.value)} />
                  </label>
                  <label>
                    Fin
                    <input type="time" value={availability.endTime} onChange={(event) => updateAvailability(index, 'endTime', event.target.value)} />
                  </label>
                  <label>
                    Intervalo
                    <input type="number" min={10} max={120} value={availability.slotIntervalMinutes} onChange={(event) => updateAvailability(index, 'slotIntervalMinutes', Number(event.target.value))} />
                  </label>
                  <label className="checkbox-field">
                    <input type="checkbox" checked={availability.isActive} onChange={(event) => updateAvailability(index, 'isActive', event.target.checked)} />
                    Activo
                  </label>
                  <button type="button" className="button button-ghost" onClick={() => setProviderForm((current) => ({ ...current, weeklyAvailabilities: current.weeklyAvailabilities.filter((_, itemIndex) => itemIndex !== index) }))}>Eliminar</button>
                </div>
              ))}
            </div>

            {providerMessage && <div className={`feedback-card ${providerMessage.includes('correctamente') ? 'success' : 'error'}`}>{providerMessage}</div>}

            <div className="inline-actions between wrap">
              <button type="button" className="button button-secondary" onClick={() => setProviderForm((current) => ({ ...current, weeklyAvailabilities: [...current.weeklyAvailabilities, emptyAvailability()] }))}>Agregar franja</button>
              <div className="inline-actions wrap">
                {!isDoctor && <button type="button" className="button button-ghost" onClick={() => void deleteProvider()}>Eliminar profesional</button>}
                <button type="button" className="button" onClick={() => void saveProvider()}>Guardar disponibilidad</button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
