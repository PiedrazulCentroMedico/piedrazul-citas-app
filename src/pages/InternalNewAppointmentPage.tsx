import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/http';
import { useAuth } from '../auth/AuthContext';
import { PortalTabs } from '../components/PortalTabs';
import type { AppointmentResponse, AvailabilitySlot, Gender, GenderOption, InternalAppointmentPayload, PatientLookup, ProviderSummary, SystemSettings } from '../types';
import { formatDateLabel, getOlderAdultBirthDateWarning, hasSettingsAccess, sanitizeNameInput, validatePatientForm } from '../utils/validators';

const initialForm = {
  providerId: '',
  appointmentDate: '',
  startTime: '',
  documentNumber: '',
  firstName: '',
  lastName: '',
  phone: '',
  gender: '' as GenderOption,
  birthDate: '',
  email: '',
  notes: '',
  channel: 'WhatsApp',
};



function toLocalDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function daysBetweenToday(dateValue: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateValue}T00:00:00`);
  return Math.max(0, Math.floor((target.getTime() - today.getTime()) / 86400000));
}

function formatShortDay(date: Date) {
  return new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: '2-digit', month: 'short' }).format(date);
}

function buildDateOptions(offset: number, maxSelectableDays: number) {
  const today = new Date();
  const startDate = addDays(today, offset);
  return Array.from({ length: 7 }, (_, index) => {
    const absoluteOffset = offset + index;
    const date = addDays(startDate, index);
    return { value: toLocalDateInputValue(date), label: formatShortDay(date), isOverflowLimit: absoluteOffset > maxSelectableDays };
  });
}

function normalizeSpecialty(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

const FIXED_SPECIALTY_OPTIONS = [
  { key: 'medicina general', label: 'Medicina General' },
  { key: 'psicologia', label: 'Psicología' },
  { key: 'terapia fisica', label: 'Terapia Física' },
  { key: 'quiropractico', label: 'Quiropráctico' },
];

function buildSpecialtyOptions() {
  return FIXED_SPECIALTY_OPTIONS;
}

function buildUniqueSpecialties(_providers: ProviderSummary[]) {
  return buildSpecialtyOptions();
}

export function InternalNewAppointmentPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [settings, setSettings] = useState<SystemSettings>({ weeksAheadBooking: 6, timeZoneId: 'America/Bogota' });
  const [dateOffset, setDateOffset] = useState(0);
  const [weekLimitModal, setWeekLimitModal] = useState(false);
  const [selectedSpecialtyKey, setSelectedSpecialtyKey] = useState('');
  const [form, setForm] = useState(initialForm);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [lookupResults, setLookupResults] = useState<PatientLookup[]>([]);
  const [patientMessage, setPatientMessage] = useState<string | null>(null);
  const [appointmentMessage, setAppointmentMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<AppointmentResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});

  const tabs = useMemo(() => {
    const items = [
      { to: '/portal/interno/citas', label: 'Listado de citas' },
      { to: '/portal/interno/nueva-cita', label: 'Nueva cita' },
      { to: '/portal/interno/reagendar', label: 'Reagendar paciente' },
    ];
    if (session?.roles.includes('Admin')) items.push({ to: '/portal/interno/usuarios', label: 'Usuarios' });
    if (hasSettingsAccess(session?.roles ?? [])) items.push({ to: '/portal/interno/configuracion', label: 'Configuración' });
    return items;
  }, [session?.roles]);

  useEffect(() => {
    if (!session) return;

    apiRequest<SystemSettings>('/api/public/settings', session)
      .then(setSettings)
      .catch(() => undefined);

    apiRequest<ProviderSummary[]>('/api/public/providers', session)
      .then((data) => {
        setProviders(data);
        const specialties = buildUniqueSpecialties(data);
        if (specialties[0]) setSelectedSpecialtyKey(specialties[0].key);
      })
      .catch((error: Error) => setAppointmentMessage(error.message));
  }, [session]);

  useEffect(() => {
    if (!form.providerId || !form.appointmentDate) {
      setSlots([]);
      return;
    }

    apiRequest<AvailabilitySlot[]>(`/api/public/providers/${form.providerId}/availability?date=${form.appointmentDate}`, session)
      .then(setSlots)
      .catch((error: Error) => setAppointmentMessage(error.message));
  }, [form.providerId, form.appointmentDate, session]);

  const selectedProvider = useMemo(() => providers.find((provider) => provider.id === form.providerId) ?? null, [form.providerId, providers]);
  const specialtyOptions = useMemo(() => buildUniqueSpecialties(providers), [providers]);
  const selectedSpecialtyKeySafe = selectedSpecialtyKey || normalizeSpecialty(selectedProvider?.specialty ?? specialtyOptions[0]?.label ?? '');
  const filteredProviders = useMemo(() => providers.filter((provider) => normalizeSpecialty(provider.specialty) === selectedSpecialtyKeySafe), [providers, selectedSpecialtyKeySafe]);
  const maxSelectableDays = settings.weeksAheadBooking * 7;
  const displayUntilWarningDays = maxSelectableDays + 7;
  const dateOptions = useMemo(() => buildDateOptions(dateOffset, maxSelectableDays), [dateOffset, maxSelectableDays]);
  const birthDateWarning = useMemo(() => getOlderAdultBirthDateWarning(form.birthDate), [form.birthDate]);

  const handleSpecialtySelected = (specialtyKey: string) => {
    setSelectedSpecialtyKey(specialtyKey);
    const firstProvider = providers.find((provider) => normalizeSpecialty(provider.specialty) === specialtyKey);
    if (firstProvider) handleChange('providerId', firstProvider.id);
  };

  const handleChange = (field: keyof typeof form, value: string) => {
    if (field === 'appointmentDate' && daysBetweenToday(value) > maxSelectableDays) {
      setWeekLimitModal(true);
      setAppointmentMessage(`Solo se pueden reservar citas dentro de las próximas ${settings.weeksAheadBooking} semanas para este profesional.`);
      return;
    }

    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === 'providerId' || field === 'appointmentDate' ? { startTime: '' } : {}),
    }));
    setPatientMessage(null);
    setAppointmentMessage(null);
    setFieldErrors((current) => ({ ...current, [field]: false }));
  };

  const resetForNewAppointment = () => {
    setSuccess(null);
    setPatientMessage(null);
    setAppointmentMessage(null);
    setLookupResults([]);
    setForm((current) => ({ ...initialForm, providerId: current.providerId }));
  };

  const lookupPatient = async () => {
    if (form.documentNumber.length < 5) {
      setPatientMessage('Ingresa al menos 5 dígitos para buscar un paciente.');
      return;
    }

    try {
      const data = await apiRequest<PatientLookup[]>(`/api/internal/patients/search?document=${form.documentNumber}`, session);
      setLookupResults(data);
      setPatientMessage(null);
      if (data.length === 0) {
        setPatientMessage('No encontramos un paciente con ese documento. Puedes completar los datos manualmente.');
        return;
      }

      const exactMatch = data.find((item) => item.documentNumber === form.documentNumber) ?? data[0];
      setForm((current) => ({
        ...current,
        documentNumber: exactMatch.documentNumber,
        firstName: exactMatch.firstName,
        lastName: exactMatch.lastName,
        phone: exactMatch.phone,
        gender: exactMatch.gender,
        birthDate: exactMatch.birthDate ?? '',
        email: exactMatch.email ?? '',
      }));
    } catch (error) {
      setPatientMessage(error instanceof Error ? error.message : 'No fue posible buscar el paciente.');
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFieldErrors({});
    if (!form.gender) {
      setFieldErrors({ gender: true });
      setPatientMessage('Selecciona el género del paciente para continuar.');
      return;
    }

    const nextErrors: Record<string, boolean> = {};
    if (!/^\d{5,20}$/.test(form.documentNumber.trim())) nextErrors.documentNumber = true;
    if (form.firstName.trim().length < 2) nextErrors.firstName = true;
    if (form.lastName.trim().length < 2) nextErrors.lastName = true;
    if (!/^\d{10}$/.test(form.phone.trim())) nextErrors.phone = true;
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) nextErrors.email = true;
    if (!form.birthDate) nextErrors.birthDate = true;
    if (!form.providerId) nextErrors.providerId = true;
    if (!form.appointmentDate) nextErrors.appointmentDate = true;
    if (!form.startTime) nextErrors.startTime = true;
    if (form.notes.length > 500) nextErrors.notes = true;

    const errors = validatePatientForm(form);
    if (!form.providerId) errors.push('Selecciona un profesional.');
    if (!form.appointmentDate) errors.push('Selecciona una fecha.');
    if (!form.startTime) errors.push('Selecciona una franja horaria.');
    if (form.appointmentDate && daysBetweenToday(form.appointmentDate) > maxSelectableDays) errors.push(`Solo se pueden reservar citas dentro de las próximas ${settings.weeksAheadBooking} semanas.`);
    if (form.notes.length > 500) errors.push('Las observaciones no pueden superar 500 caracteres.');

    if (errors.length > 0 || Object.values(nextErrors).some(Boolean)) {
      setFieldErrors(nextErrors);
      const first = errors[0];
      if (first.includes('documento') || first.includes('nombres') || first.includes('apellidos') || first.includes('celular') || first.includes('correo')) {
        setPatientMessage(first);
      } else {
        setAppointmentMessage(first);
      }
      return;
    }

    const payload: InternalAppointmentPayload = {
      providerId: form.providerId,
      appointmentDate: form.appointmentDate,
      startTime: form.startTime,
      documentNumber: form.documentNumber,
      firstName: form.firstName,
      lastName: form.lastName,
      phone: form.phone,
      gender: form.gender as Gender,
      birthDate: form.birthDate || null,
      email: form.email || null,
      notes: form.notes || '',
      channel: form.channel,
    };

    try {
      setSubmitting(true);
      const result = await apiRequest<AppointmentResponse>('/api/internal/appointments', session, {
        method: 'POST',
        body: payload,
      });
      setSuccess(result);
      setAppointmentMessage(null);
      setPatientMessage(null);
    } catch (error) {
      setAppointmentMessage(error instanceof Error ? error.message : 'No fue posible crear la cita.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="stack-lg">
      <section className="section-card">
        <h1>Nueva cita para llamadas o WhatsApp</h1>
        <p className="muted-text">Usa el documento del paciente para autocompletar y reservar más rápido.</p>
      </section>

      <PortalTabs items={tabs} />

      <form className="stack-lg" onSubmit={handleSubmit}>
        <section className="section-card stack-md">
          <h2>Datos del paciente</h2>
          <div className="form-grid internal-filter-grid">
            <label>
              Documento <span className="required-star">*</span>
              <input className={fieldErrors.documentNumber ? 'input-error' : ''} inputMode="numeric" maxLength={20} value={form.documentNumber} onChange={(event) => handleChange('documentNumber', event.target.value.replace(/\D/g, ''))} />
            </label>
            <div className="inline-actions end align-end">
              <button type="button" className="button button-secondary" onClick={() => void lookupPatient()}>
                Buscar paciente
              </button>
            </div>
          </div>

          {lookupResults.length > 0 && (
            <div className="lookup-list">
              {lookupResults.map((patient) => (
                <button
                  type="button"
                  key={patient.id}
                  className="lookup-card"
                  onClick={() => {
                    setForm((current) => ({
                      ...current,
                      documentNumber: patient.documentNumber,
                      firstName: patient.firstName,
                      lastName: patient.lastName,
                      phone: patient.phone,
                      gender: patient.gender,
                      birthDate: patient.birthDate ?? '',
                      email: patient.email ?? '',
                    }));
                    setPatientMessage(null);
                  }}
                >
                  <strong>{patient.fullName}</strong>
                  <span>{patient.documentNumber} · {patient.phone}</span>
                </button>
              ))}
            </div>
          )}

          <div className="form-grid">
            <label>
              Nombres <span className="required-star">*</span>
              <input className={fieldErrors.firstName ? 'input-error' : ''} maxLength={80} value={form.firstName} onChange={(event) => handleChange('firstName', sanitizeNameInput(event.target.value))} />
            </label>
            <label>
              Apellidos <span className="required-star">*</span>
              <input className={fieldErrors.lastName ? 'input-error' : ''} maxLength={80} value={form.lastName} onChange={(event) => handleChange('lastName', sanitizeNameInput(event.target.value))} />
            </label>
            <label>
              Celular <span className="required-star">*</span>
              <input className={fieldErrors.phone ? 'input-error' : ''} inputMode="numeric" maxLength={15} value={form.phone} onChange={(event) => handleChange('phone', event.target.value.replace(/\D/g, ''))} />
            </label>
            <label>
              Género <span className="required-star">*</span>
              <select className={fieldErrors.gender ? 'input-error' : ''} value={form.gender} onChange={(event) => handleChange('gender', event.target.value)}>
                <option value="">Seleccionar género</option>
                <option value="Female">Mujer</option>
                <option value="Male">Hombre</option>
                <option value="Other">Otro</option>
              </select>
            </label>
            <label>
              Fecha de nacimiento <span className="required-star">*</span>
              <input className={fieldErrors.birthDate ? 'input-error' : ''} type="date" value={form.birthDate} onChange={(event) => handleChange('birthDate', event.target.value)} />
              {birthDateWarning && <small className="field-warning">{birthDateWarning}</small>}
            </label>
            <label>
              Correo electrónico
              <input className={fieldErrors.email ? 'input-error' : ''} type="email" maxLength={150} value={form.email} onChange={(event) => handleChange('email', event.target.value)} />
            </label>
          </div>

          {patientMessage && <div className="feedback-card error">{patientMessage}</div>}
        </section>

        <section className="section-card stack-md">
          <h2>Datos de la cita</h2>
          <div className="appointment-flow-card stack-md">
            <div className="step-hint">
              <strong>1. Selecciona tipo y profesional</strong>
              <span>Primero elige la especialidad; después selecciona el profesional disponible.</span>
            </div>
            <div className="specialty-choice-grid compact-choice-grid" role="group" aria-label="Tipo de profesional">
              {specialtyOptions.map((specialty) => (
                <button key={specialty.key} type="button" className={`choice-card ${selectedSpecialtyKeySafe === specialty.key ? 'selected' : ''}`} onClick={() => handleSpecialtySelected(specialty.key)}>
                  <span className="choice-check">{selectedSpecialtyKeySafe === specialty.key ? '✓' : ''}</span>
                  <strong>{specialty.label}</strong>
                </button>
              ))}
            </div>
            <div className="provider-choice-grid" role="group" aria-label="Profesional">
              {filteredProviders.map((provider) => (
                <button key={provider.id} type="button" className={`provider-choice-card ${form.providerId === provider.id ? 'selected' : ''} ${fieldErrors.providerId ? 'input-error' : ''}`} onClick={() => handleChange('providerId', provider.id)}>
                  <strong>{provider.fullName}</strong>
                  <span>{provider.specialty}</span>
                </button>
              ))}
            </div>
            {selectedProvider && <div className="selection-help success-soft">Profesional seleccionado: <strong>{selectedProvider.fullName}</strong>. Ahora completa fecha, canal y horario.</div>}
          </div>

          <div className="appointment-flow-card stack-md">
            <div className="step-hint">
              <strong>2. Completa fecha y canal</strong>
              <span>Cuando selecciones la fecha aparecerán las horas disponibles.</span>
            </div>
            <div className="form-grid">
              <div className="span-two internal-date-strip-field">
                <span className="field-label">Fecha de la cita <span className="required-star">*</span></span>
                <div className={`date-strip ${fieldErrors.appointmentDate ? 'input-error' : ''}`} aria-label="Seleccionar fecha de la cita">
                  <button type="button" className="date-strip-arrow" onClick={() => setDateOffset((current) => Math.max(0, current - 7))} disabled={dateOffset === 0} aria-label="Ver fechas anteriores">‹</button>
                  <div className="date-strip-days">
                    {dateOptions.map((dateOption) => (
                      <button
                        key={dateOption.value}
                        type="button"
                        className={`date-option ${form.appointmentDate === dateOption.value ? 'selected' : ''} ${dateOption.isOverflowLimit ? 'limit-blocked' : ''}`}
                        onClick={() => dateOption.isOverflowLimit ? setWeekLimitModal(true) : handleChange('appointmentDate', dateOption.value)}
                      >
                        <strong>{dateOption.label}</strong>
                        {dateOption.isOverflowLimit && <small>Límite máximo</small>}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="date-strip-arrow" onClick={() => { const next = dateOffset + 7; if (next > displayUntilWarningDays) { setWeekLimitModal(true); return; } setDateOffset(next); }} aria-label="Ver más fechas">›</button>
                </div>
                {form.appointmentDate && <small className="muted-text">Fecha seleccionada: {formatDateLabel(form.appointmentDate)}</small>}
              </div>
              <label>
                Canal de contacto <span className="required-star">*</span>
                <select value={form.channel} onChange={(event) => handleChange('channel', event.target.value)}>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Phone">Llamada</option>
                  <option value="Internal">Mostrador</option>
                </select>
              </label>
              <label className="span-two">
                Observaciones para la atención
                <textarea className={fieldErrors.notes ? 'input-error' : ''} rows={3} maxLength={500} value={form.notes} placeholder="Ejemplo: paciente solicita control, llega por WhatsApp, requiere confirmación telefónica..." onChange={(event) => handleChange('notes', event.target.value)} />
              </label>
            </div>
          </div>

          <div className="stack-sm">
            <h3>3. Selecciona una hora disponible</h3>
            <div className="slot-grid">
              {slots.length === 0 && <div className="empty-state">Selecciona primero el profesional y la fecha. Luego aquí aparecerán las horas disponibles.</div>}
              {slots.map((slot) => (
                <button
                  type="button"
                  key={`${slot.startTime}-${slot.endTime}`}
                  disabled={!slot.available}
                  className={`slot-button ${form.startTime === slot.startTime ? 'selected' : ''}`}
                  onClick={() => handleChange('startTime', slot.startTime)}
                >
                  <strong>{slot.startTime}</strong>
                  <span>{slot.endTime}</span>
                  <small>{slot.available ? 'Disponible' : 'No disponible'}</small>
                </button>
              ))}
            </div>
          </div>

          {appointmentMessage && <div className="feedback-card error">{appointmentMessage}</div>}
        </section>

        <div className="inline-actions end">
          <button type="submit" className="button" disabled={submitting}>
            {submitting ? 'Creando cita...' : 'Crear cita'}
          </button>
        </div>
      </form>

      {weekLimitModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-card compact-modal stack-md">
            <span className="eyebrow eyebrow-warning">Límite de agenda</span>
            <h2>Este profesional solo permite reservar hasta {settings.weeksAheadBooking} semanas adelante</h2>
            <p className="muted-text">La última semana visible queda bloqueada para evitar reservas fuera del rango configurado.</p>
            <div className="inline-actions end"><button type="button" className="button" onClick={() => setWeekLimitModal(false)}>Entendido</button></div>
          </section>
        </div>
      )}

      {success && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-card stack-md">
            <span className="eyebrow">Cita confirmada</span>
            <h2>La cita fue registrada correctamente</h2>
            <div className="summary-grid">
              <div><span>Paciente</span><strong>{success.patientFullName}</strong></div>
              <div><span>Profesional</span><strong>{success.providerName}</strong></div>
              <div><span>Especialidad</span><strong>{success.specialty}</strong></div>
              <div><span>Fecha y hora</span><strong>{formatDateLabel(success.appointmentDate)} · {success.startTime}</strong></div>
            </div>
            <div className="inline-actions end wrap">
              <button type="button" className="button button-secondary" onClick={resetForNewAppointment}>Crear nueva cita</button>
              <button type="button" className="button" onClick={() => navigate('/portal/interno/citas')}>Ir al inicio</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
