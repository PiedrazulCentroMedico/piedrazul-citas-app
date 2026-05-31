import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/http';
import { useAuth } from '../auth/AuthContext';
import { PortalTabs } from '../components/PortalTabs';
import type { AppointmentResponse, AvailabilitySlot, Gender, GenderOption, InternalAppointmentPayload, PatientLookup, ProviderSummary } from '../types';
import { formatDateLabel, hasSettingsAccess, isDoctorRole, sanitizeNameInput, validatePatientForm } from '../utils/validators';

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

export function InternalNewAppointmentPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const isDoctor = isDoctorRole(session?.roles ?? []);
  const canManageUsers = session?.roles.includes('Admin') ?? false;
  const tabs = useMemo(() => {
    const base = [{ to: '/portal/interno/citas', label: isDoctor ? 'Mis citas' : 'Listado de citas' }];
    if (!isDoctor) base.push({ to: '/portal/interno/nueva-cita', label: 'Nueva cita' });
    if (canManageUsers) base.push({ to: '/portal/interno/usuarios', label: 'Usuarios' });
    if (hasSettingsAccess(session?.roles ?? [])) base.push({ to: '/portal/interno/configuracion', label: 'Configuración' });
    if (isDoctor) base.push({ to: '/portal/interno/perfil', label: 'Mi perfil' });
    return base;
  }, [canManageUsers, isDoctor, session?.roles]);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [form, setForm] = useState(initialForm);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [lookupResults, setLookupResults] = useState<PatientLookup[]>([]);
  const [patientMessage, setPatientMessage] = useState<string | null>(null);
  const [appointmentMessage, setAppointmentMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<AppointmentResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!session) return;

    apiRequest<ProviderSummary[]>('/api/public/providers', session)
      .then((data) => setProviders(data))
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

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === 'providerId' || field === 'appointmentDate' ? { startTime: '' } : {}),
    }));
    setPatientMessage(null);
    setAppointmentMessage(null);
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
    if (!form.gender) {
      setPatientMessage('Selecciona el género del paciente para continuar.');
      return;
    }

    const errors = validatePatientForm(form);
    if (!form.providerId) errors.push('Selecciona un profesional.');
    if (!form.appointmentDate) errors.push('Selecciona una fecha.');
    if (!form.startTime) errors.push('Selecciona una franja horaria.');
    if (form.notes.length > 500) errors.push('Las observaciones no pueden superar 500 caracteres.');

    if (errors.length > 0) {
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
              Documento
              <input inputMode="numeric" maxLength={20} value={form.documentNumber} onChange={(event) => handleChange('documentNumber', event.target.value.replace(/\D/g, ''))} />
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
              Nombres
              <input maxLength={80} value={form.firstName} onChange={(event) => handleChange('firstName', sanitizeNameInput(event.target.value))} />
            </label>
            <label>
              Apellidos
              <input maxLength={80} value={form.lastName} onChange={(event) => handleChange('lastName', sanitizeNameInput(event.target.value))} />
            </label>
            <label>
              Celular
              <input inputMode="numeric" maxLength={15} value={form.phone} onChange={(event) => handleChange('phone', event.target.value.replace(/\D/g, ''))} />
            </label>
            <label>
              Género
              <select value={form.gender} onChange={(event) => handleChange('gender', event.target.value)}>
                <option value="">Seleccionar género</option>
                <option value="Female">Mujer</option>
                <option value="Male">Hombre</option>
                <option value="Other">Otro</option>
              </select>
            </label>
            <label>
              Fecha de nacimiento
              <input type="date" value={form.birthDate} onChange={(event) => handleChange('birthDate', event.target.value)} />
            </label>
            <label>
              Correo electrónico
              <input type="email" maxLength={150} value={form.email} onChange={(event) => handleChange('email', event.target.value)} />
            </label>
          </div>

          {patientMessage && <div className="feedback-card error">{patientMessage}</div>}
        </section>

        <section className="section-card stack-md">
          <h2>Datos de la cita</h2>
          <div className="form-grid">
            <label className="span-two">
              Profesional
              <select value={form.providerId} onChange={(event) => handleChange('providerId', event.target.value)}>
                <option value="">Selecciona una opción</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>{provider.specialty} - {provider.fullName}</option>
                ))}
              </select>
            </label>
            <label>
              Fecha
              <input type="date" value={form.appointmentDate} onChange={(event) => handleChange('appointmentDate', event.target.value)} />
            </label>
            <label>
              Canal
              <select value={form.channel} onChange={(event) => handleChange('channel', event.target.value)}>
                <option value="WhatsApp">WhatsApp</option>
                <option value="Phone">Llamada</option>
                <option value="Internal">Mostrador</option>
              </select>
            </label>
            <label className="span-two">
              Observaciones
              <textarea rows={4} maxLength={500} value={form.notes} onChange={(event) => handleChange('notes', event.target.value)} />
            </label>
          </div>

          <div className="stack-sm">
            <h3>Horarios disponibles</h3>
            <div className="slot-grid">
              {slots.length === 0 && <div className="empty-state">Selecciona profesional y fecha para ver los horarios disponibles.</div>}
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
