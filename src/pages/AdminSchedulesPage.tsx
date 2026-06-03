import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/http';
import { useAuth } from '../auth/AuthContext';
import { PortalTabs } from '../components/PortalTabs';
import type { CreateDoctorPayload, ProviderSchedule, ProviderSchedulePayload, SystemSettings, WeeklyAvailability } from '../types';
import { linkDoctorToProvider, getLinkedProviderId, linkDefaultSeededDoctors } from '../utils/sessionStorage';
import { demoProviderSchedules, demoSystemSettings } from '../utils/demoProviders';
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
  documentNumber: '',
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

function normalizeText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
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
  const navigate = useNavigate();
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
  const [providerMessage, setProviderMessage] = useState<string | null>(null);
  const [doctorMessage, setDoctorMessage] = useState<string | null>(null);
  const [settingsErrors, setSettingsErrors] = useState<Record<string, boolean>>({});
  const [providerErrors, setProviderErrors] = useState<Record<string, boolean>>({});
  const [doctorErrors, setDoctorErrors] = useState<Record<string, boolean>>({});
  const [configurationStep, setConfigurationStep] = useState<'create' | 'availability'>('availability');
  const [showDoctorPassword, setShowDoctorPassword] = useState(false);

  const tabs = useMemo(() => {
    const items = [{ to: '/portal/interno/citas', label: isDoctor ? 'Mis citas' : 'Listado de citas' }];
    if (!isDoctor) {
      items.push({ to: '/portal/interno/nueva-cita', label: 'Nueva cita' });
      items.push({ to: '/portal/interno/reagendar', label: 'Reagendar paciente' });
    }
    if (session?.roles.includes('Admin')) items.push({ to: '/portal/interno/usuarios', label: 'Usuarios' });
    if (hasSettingsAccess(session?.roles ?? [])) items.push({ to: '/portal/interno/configuracion', label: 'Configuración' });
    if (isDoctor) items.push({ to: '/portal/interno/perfil', label: 'Mi perfil' });
    return items;
  }, [isDoctor, session?.roles]);

  useEffect(() => {
    if (!session) return;

    const hydrateSchedules = (settingsData: SystemSettings, schedulesData: ProviderSchedule[], showOfflineNotice = false) => {
      setSettings(settingsData);
      const normalizedSchedules = schedulesData.map(normalizeSchedule);
      linkDefaultSeededDoctors(normalizedSchedules);
      setSchedules(normalizedSchedules);
      if (isDoctor) {
        const linked = getLinkedProviderId(session.email);
        const normalizedDisplayName = normalizeText(session.displayName ?? '');
        const mine = normalizedSchedules.find((item) => item.providerId === linked)
          ?? normalizedSchedules.find((item) => normalizeText(item.providerName).includes(normalizedDisplayName) || normalizedDisplayName.includes(normalizeText(item.providerName)));
        if (mine) setSelectedProviderId(mine.providerId);
        else if (normalizedSchedules[0]) setSelectedProviderId(normalizedSchedules[0].providerId);
      } else if (normalizedSchedules[0]) {
        setSelectedProviderId(normalizedSchedules[0].providerId);
      }
      if (showOfflineNotice && !isDoctor) setProviderMessage('No se pudo conectar con el backend. Se muestra configuración demo para no bloquear el flujo. Reinicia la API para guardar cambios reales.');
    };

    Promise.all([
      apiRequest<SystemSettings>('/api/admin/settings', session),
      apiRequest<ProviderSchedule[]>('/api/admin/provider-schedules', session),
    ])
      .then(([settingsData, schedulesData]) => hydrateSchedules(settingsData, schedulesData))
      .catch(() => hydrateSchedules(demoSystemSettings, demoProviderSchedules, true));
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
    setProviderErrors({});
    setProviderForm((current) => ({
      ...current,
      weeklyAvailabilities: current.weeklyAvailabilities.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
    }));
    setProviderMessage(null);
  };

  const saveSettings = async () => {
    setSettingsErrors({});
    if (!Number.isInteger(settings.weeksAheadBooking) || settings.weeksAheadBooking < 1 || settings.weeksAheadBooking > 24) {
      setSettingsErrors({ weeksAheadBooking: true });
      setProviderMessage('Las semanas habilitadas deben estar entre 1 y 24.');
      return;
    }
    try {
      const result = await apiRequest<SystemSettings>('/api/admin/settings', session, {
        method: 'PUT',
        body: settings,
      });
      setSettings(result);
      setProviderMessage('Las semanas habilitadas se guardaron correctamente.');
    } catch (error) {
      setProviderMessage(error instanceof Error ? error.message : 'No pudimos guardar las semanas habilitadas.');
    }
  };

  const saveProvider = async () => {
    if (!selectedProviderId) {
      setProviderMessage('Selecciona un profesional antes de guardar la disponibilidad.');
      return;
    }

    const profileErrors = {
      firstName: providerForm.firstName.trim().length < 2,
      lastName: providerForm.lastName.trim().length < 2,
      specialty: providerForm.specialty.trim().length < 2,
    };
    setProviderErrors(profileErrors);
    if (Object.values(profileErrors).some(Boolean)) {
      setProviderMessage('Los nombres, apellidos y especialidad del profesional son obligatorios.');
      return;
    }

    if (providerForm.weeklyAvailabilities.length === 0) {
      setProviderMessage('Debes dejar al menos una franja configurada.');
      return;
    }

    const availabilityErrors = validateAvailabilityEntries(providerForm.weeklyAvailabilities);
    if (availabilityErrors.length > 0) {
      setProviderErrors((current) => ({ ...current, weeklyAvailabilities: true }));
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
      window.sessionStorage.setItem('pz-internal-toast', 'La disponibilidad del profesional se actualizó correctamente.');
      navigate('/portal/interno/citas');
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

  const normalizeCorporateEmail = (value: string) => {
    const base = value.trim().toLowerCase();
    if (!base) return '';
    if (base.endsWith('@piedrazul.local')) return base;
    const localPart = base.includes('@') ? base.split('@')[0] : base;
    return `${localPart}@piedrazul.local`;
  };

  const createDoctor = async () => {
    const corporateEmail = normalizeCorporateEmail(doctorForm.email);
    const nextDoctorErrors = {
      documentNumber: !/^\d{5,20}$/.test(doctorForm.documentNumber.trim()),
      firstName: doctorForm.firstName.trim().length < 2,
      lastName: doctorForm.lastName.trim().length < 2,
      specialty: doctorForm.specialty.trim().length < 2,
      email: !doctorForm.email.trim(),
      password: !doctorForm.password.trim(),
    };
    setDoctorErrors(nextDoctorErrors);
    if (Object.values(nextDoctorErrors).some(Boolean)) {
      setDoctorMessage('Completa cédula, nombres, apellidos, especialidad, correo y contraseña para crear el perfil médico.');
      return;
    }

    if (!corporateEmail.endsWith('@piedrazul.local')) {
      setDoctorErrors((current) => ({ ...current, email: true }));
      setDoctorMessage('El correo del personal interno debe terminar en @piedrazul.local.');
      return;
    }

    const passwordValidation = validateStrongPassword(doctorForm.password);
    if (!passwordValidation.isValid) {
      setDoctorErrors((current) => ({ ...current, password: true }));
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
      linkDoctorToProvider(corporateEmail, provider.providerId);
      createInternalDemoAccount({
        documentNumber: doctorForm.documentNumber.trim(),
        email: corporateEmail,
        password: doctorForm.password,
        displayName: `${doctorForm.firstName.trim()} ${doctorForm.lastName.trim()}`,
        roles: ['Doctor'],
      });
      setSelectedProviderId(provider.providerId);
      setProviderForm({
        firstName: schedulePayload.firstName,
        lastName: schedulePayload.lastName,
        specialty: schedulePayload.specialty,
        defaultSlotIntervalMinutes: schedulePayload.defaultSlotIntervalMinutes,
        weeklyAvailabilities: schedulePayload.weeklyAvailabilities.map((item) => ({ ...item })),
      });
      setDoctorForm(emptyDoctorForm());
      setConfigurationStep('availability');
      setProviderMessage('Perfil creado. Ahora ajusta las franjas de atención y guarda la disponibilidad.');
      setDoctorMessage('El perfil médico se creó correctamente y quedó listo para configurar su agenda.');
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
        <section className="section-card stack-md config-dashboard">
          <div>
            <span className="eyebrow">Configuración guiada</span>
            <h2>¿Qué quieres hacer?</h2>
            <p className="muted-text">Separé la configuración para que no se mezcle crear médicos con editar horarios.</p>
          </div>
          <div className="config-actions">
            <button type="button" className={`config-action-card ${configurationStep === 'availability' ? 'active' : ''}`} onClick={() => setConfigurationStep('availability')}>
              <strong>Editar agenda</strong>
              <span>Selecciona un profesional y ajusta sus franjas.</span>
            </button>
            <button type="button" className={`config-action-card ${configurationStep === 'create' ? 'active' : ''}`} onClick={() => setConfigurationStep('create')}>
              <strong>Crear médico</strong>
              <span>Primero datos personales; luego pasas a franjas.</span>
            </button>
          </div>
        </section>
      )}


      {!isDoctor && configurationStep === 'create' && (
        <section className="section-card stack-md">
          <span className="eyebrow">Paso 1 de 2</span>
          <h2>Datos del médico</h2>
          <p className="muted-text">Al crear el perfil, el sistema te llevará automáticamente a configurar sus franjas de atención.</p>
          <div className="form-grid">
            <label>
              Cédula <span className="required-star">*</span>
              <input className={doctorErrors.documentNumber ? 'input-error' : ''} inputMode="numeric" value={doctorForm.documentNumber} onChange={(event) => { setDoctorForm((current) => ({ ...current, documentNumber: event.target.value.replace(/\D/g, '') })); setDoctorErrors((current) => ({ ...current, documentNumber: false })); }} />
            </label>
            <label>
              Nombres <span className="required-star">*</span>
              <input className={doctorErrors.firstName ? 'input-error' : ''} value={doctorForm.firstName} onChange={(event) => { setDoctorForm((current) => ({ ...current, firstName: sanitizeNameInput(event.target.value) })); setDoctorErrors((current) => ({ ...current, firstName: false })); }} />
            </label>
            <label>
              Apellidos <span className="required-star">*</span>
              <input className={doctorErrors.lastName ? 'input-error' : ''} value={doctorForm.lastName} onChange={(event) => { setDoctorForm((current) => ({ ...current, lastName: sanitizeNameInput(event.target.value) })); setDoctorErrors((current) => ({ ...current, lastName: false })); }} />
            </label>
            <label>
              Especialidad <span className="required-star">*</span>
              <select className={doctorErrors.specialty ? 'input-error' : ''} value={doctorForm.specialty} onChange={(event) => { setDoctorForm((current) => ({ ...current, specialty: event.target.value })); setDoctorErrors((current) => ({ ...current, specialty: false })); }}>
                {specialtyOptions.map((specialty) => (
                  <option key={specialty} value={specialty}>{specialty}</option>
                ))}
              </select>
            </label>
            <label>
              Correo corporativo <span className="required-star">*</span>
              <input className={doctorErrors.email ? 'input-error' : ''} type="email" value={doctorForm.email} placeholder="usuario@piedrazul.local" onBlur={(event) => setDoctorForm((current) => ({ ...current, email: normalizeCorporateEmail(event.target.value) }))} onChange={(event) => { setDoctorForm((current) => ({ ...current, email: event.target.value })); setDoctorErrors((current) => ({ ...current, email: false })); }} />
            </label>
            <label className="span-two">
              Contraseña inicial <span className="required-star">*</span>
              <div className="password-input-row">
                <input className={doctorErrors.password ? 'input-error' : ''} type={showDoctorPassword ? 'text' : 'password'} value={doctorForm.password} onChange={(event) => { setDoctorForm((current) => ({ ...current, password: event.target.value })); setDoctorErrors((current) => ({ ...current, password: false })); }} />
                <button type="button" className="button button-secondary password-toggle-button" onClick={() => setShowDoctorPassword((current) => !current)}>
                  {showDoctorPassword ? 'Ocultar' : 'Ver'}
                </button>
              </div>
              <small className="helper-text">Debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número o carácter especial.</small>
            </label>
          </div>
          {doctorMessage && <div className={`feedback-card ${doctorMessage.includes('correctamente') ? 'success' : 'error'}`}>{doctorMessage}</div>}
          <div className="inline-actions end">
            <button type="button" className="button" onClick={() => void createDoctor()}>Crear perfil médico</button>
          </div>
        </section>
      )}

      {(isDoctor || configurationStep === 'availability') && (
      <section className="section-card stack-md">
        {!isDoctor && <span className="eyebrow">Paso 2 de 2</span>}
        <h2>{isDoctor ? 'Mi disponibilidad' : 'Disponibilidad por profesional'}</h2>
        {!isDoctor && <p className="muted-text">Aquí editas el profesional, las semanas habilitadas y las franjas semanales en un solo lugar.</p>}
        <div className="form-grid internal-filter-grid">
          {isDoctor ? (
            <div className="readonly-professional-card">
              <span>Profesional asociado a tu cuenta</span>
              <strong>{selectedProvider?.providerName ?? session?.displayName ?? 'Profesional'}</strong>
              <small>{selectedProvider?.specialty ?? 'Sin especialidad cargada'}</small>
            </div>
          ) : (
            <label>
              Profesional <span className="required-star">*</span>
              <select value={selectedProviderId} onChange={(event) => setSelectedProviderId(event.target.value)}>
                <option value="">Selecciona una opción</option>
                {schedules.map((schedule) => (
                  <option key={schedule.providerId} value={schedule.providerId}>{schedule.providerName} - {schedule.specialty}</option>
                ))}
              </select>
            </label>
          )}
          {!isDoctor && (
            <label>
              Semanas habilitadas <span className="required-star">*</span>
              <input type="number" min={1} max={24} className={settingsErrors.weeksAheadBooking ? 'input-error' : ''} value={settings.weeksAheadBooking} onChange={(event) => { setSettings((current) => ({ ...current, weeksAheadBooking: Number(event.target.value) })); setSettingsErrors({}); }} />
            </label>
          )}
          {!isDoctor && (
            <div className="inline-actions align-end">
              <button type="button" className="button button-secondary" onClick={() => void saveSettings()}>Guardar semanas</button>
            </div>
          )}
        </div>

        {selectedProvider && (
          <>
            <div className="form-grid">
              <label>
                Nombres
                <input className={providerErrors.firstName ? 'input-error' : ''} value={providerForm.firstName} onChange={(event) => { setProviderForm((current) => ({ ...current, firstName: sanitizeNameInput(event.target.value) })); setProviderErrors((current) => ({ ...current, firstName: false })); }} />
              </label>
              <label>
                Apellidos
                <input className={providerErrors.lastName ? 'input-error' : ''} value={providerForm.lastName} onChange={(event) => { setProviderForm((current) => ({ ...current, lastName: sanitizeNameInput(event.target.value) })); setProviderErrors((current) => ({ ...current, lastName: false })); }} />
              </label>
              <label className="span-two">
                Especialidad
                <select className={providerErrors.specialty ? 'input-error' : ''} value={providerForm.specialty} onChange={(event) => { setProviderForm((current) => ({ ...current, specialty: event.target.value })); setProviderErrors((current) => ({ ...current, specialty: false })); }}>
                  {specialtyOptions.map((specialty) => (
                    <option key={specialty} value={specialty}>{specialty}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="stack-md">
              {providerForm.weeklyAvailabilities.map((availability, index) => (
                <div key={`${index}-${availability.startTime}-${availability.endTime}`} className={`availability-row ${providerErrors.weeklyAvailabilities ? 'input-error' : ''}`}>
                  <label>
                    Día <span className="required-star">*</span>
                    <select value={availability.dayOfWeek} onChange={(event) => updateAvailability(index, 'dayOfWeek', Number(event.target.value))}>
                      {dayOptions.map((day) => (<option key={day.value} value={day.value}>{day.label}</option>))}
                    </select>
                  </label>
                  <label>
                    Inicio <span className="required-star">*</span>
                    <input type="time" value={availability.startTime} onChange={(event) => updateAvailability(index, 'startTime', event.target.value)} />
                  </label>
                  <label>
                    Fin <span className="required-star">*</span>
                    <input type="time" value={availability.endTime} onChange={(event) => updateAvailability(index, 'endTime', event.target.value)} />
                  </label>
                  <label>
                    Intervalo <span className="required-star">*</span>
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

            {providerMessage && <div className={`feedback-card ${providerMessage.includes('correctamente') || providerMessage.includes('Perfil creado') || providerMessage.includes('demo') ? 'success' : 'error'}`}>{providerMessage}</div>}

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
      )}
    </div>
  );
}
