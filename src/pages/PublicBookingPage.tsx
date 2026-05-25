import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/http';
import { useAuth } from '../auth/AuthContext';
import type { AppointmentResponse, AvailabilitySlot, CaptchaChallenge, Gender, GenderOption, PatientProfile, PatientPublicLookup, ProviderSummary, PublicAppointmentPayload } from '../types';
import { formatDateLabel, sanitizeNameInput, validatePatientForm } from '../utils/validators';

function toMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours * 60) + minutes;
}

function toLocalDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createCaptchaChallenge(): CaptchaChallenge {
  const left = Math.floor(Math.random() * 8) + 2;
  const right = Math.floor(Math.random() * 8) + 1;
  return { left, right, answer: '' };
}

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
};

export function PublicBookingPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const isPatientSession = session?.roles.includes('Patient') ?? false;
  const [form, setForm] = useState(initialForm);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<AppointmentResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [documentVerified, setDocumentVerified] = useState(false);
  const [patientLookup, setPatientLookup] = useState<PatientPublicLookup | null>(null);
  const [guestLimitModal, setGuestLimitModal] = useState<PatientPublicLookup | null>(null);
  const [captcha, setCaptcha] = useState<CaptchaChallenge>(createCaptchaChallenge);

  useEffect(() => {
    apiRequest<ProviderSummary[]>('/api/public/providers', null)
      .then((data) => {
        setProviders(data);
        if (data[0]) {
          setForm((current) => ({ ...current, providerId: current.providerId || data[0].id }));
        }
      })
      .catch((error: Error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (!isPatientSession) return;

    apiRequest<PatientProfile>('/api/patient/profile', session)
      .then((profile) => {
        setDocumentVerified(true);
        setForm((current) => ({
          ...current,
          documentNumber: profile.documentNumber,
          firstName: profile.firstName,
          lastName: profile.lastName,
          phone: profile.phone,
          gender: profile.gender,
          birthDate: profile.birthDate ?? '',
          email: profile.email ?? '',
        }));
      })
      .catch(() => undefined);
  }, [isPatientSession, session]);

  useEffect(() => {
    if (!form.providerId || !form.appointmentDate) {
      setSlots([]);
      return;
    }

    setLoadingSlots(true);
    apiRequest<AvailabilitySlot[]>(`/api/public/providers/${form.providerId}/availability?date=${form.appointmentDate}`, null)
      .then(setSlots)
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setLoadingSlots(false));
  }, [form.providerId, form.appointmentDate]);

  const selectedProvider = useMemo(() => providers.find((provider) => provider.id === form.providerId), [providers, form.providerId]);
  const mustCreateAccount = false;

  const visibleSlots = useMemo(() => {
    if (!form.appointmentDate) return slots;

    const selectedDate = form.appointmentDate;
    const now = new Date();
    const today = toLocalDateInputValue(now);

    if (selectedDate !== today) {
      return slots;
    }

    const minimumMinutes = (now.getHours() * 60) + now.getMinutes() + 60;
    return slots.filter((slot) => toMinutes(slot.startTime) >= minimumMinutes);
  }, [form.appointmentDate, slots]);

  const slotAvailabilityMessage = useMemo(() => {
    if (!form.appointmentDate) {
      return 'Selecciona profesional y fecha para ver las franjas disponibles.';
    }

    if (slots.length === 0) {
      return 'No hay franjas configuradas para la fecha seleccionada.';
    }

    if (visibleSlots.length === 0) {
      return 'No hay franjas reservables para esta fecha. Solo se muestran citas con al menos 1 hora de anticipación.';
    }

    return null;
  }, [form.appointmentDate, slots.length, visibleSlots.length]);

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === 'providerId' || field === 'appointmentDate' ? { startTime: '' } : {}),
    }));
    if (!isPatientSession && field === 'documentNumber') {
      setDocumentVerified(false);
      setPatientLookup(null);
    }
    setMessage(null);
  };

  const verifyDocument = async () => {
    const documentNumber = form.documentNumber.trim();
    if (!/^\d{5,20}$/.test(documentNumber)) {
      setMessage('Ingresa una cédula válida antes de verificar.');
      return;
    }

    try {
      setLookupLoading(true);
      setMessage(null);
      setSuccess(null);
      const lookup = await apiRequest<PatientPublicLookup>(`/api/public/patients/lookup?document=${documentNumber}`, null);
      setDocumentVerified(true);
      setPatientLookup(lookup.exists ? lookup : null);

      if (lookup.mustRegister) {
        setGuestLimitModal(lookup);
      } 

      if (lookup.exists) {
        setForm((current) => ({
          ...current,
          documentNumber,
          firstName: lookup.firstName ?? '',
          lastName: lookup.lastName ?? '',
          gender: lookup.gender ?? ('' as GenderOption),
          phone: '',
          birthDate: '',
          email: '',
        }));
      } else {
        setForm((current) => ({
          ...current,
          firstName: '',
          lastName: '',
          phone: '',
          gender: '' as GenderOption,
          birthDate: '',
          email: '',
        }));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible verificar la cédula.');
    } finally {
      setLookupLoading(false);
    }
  };

  const validateReservation = () => {
    if (!isPatientSession && !documentVerified) {
      return 'Primero verifica la cédula para continuar con la reserva.';
    }

    if (!form.gender) {
      return 'Selecciona un género para continuar con la reserva.';
    }

    const errors = validatePatientForm(form);
    if (!form.providerId) errors.push('Debes seleccionar un médico o terapista.');
    if (!form.appointmentDate) errors.push('Debes seleccionar una fecha.');
    if (!form.startTime) errors.push('Debes seleccionar una franja horaria.');

    if (!isPatientSession && Number(captcha.answer) !== captcha.left + captcha.right) {
      errors.push('Resuelve correctamente la verificación anti-bots para confirmar la reserva.');
    }

    return errors[0] ?? null;
  };

  const submitReservation = async (bookAsGuest: boolean) => {
    const payload: PublicAppointmentPayload = {
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
      bookAsGuest,
    };

    try {
      setSubmitting(true);
      const path = !bookAsGuest && isPatientSession ? '/api/patient/appointments' : '/api/public/appointments';
      const result = await apiRequest<AppointmentResponse>(path, session, {
        method: 'POST',
        body: payload,
      });
      setSuccess(result);
      setCaptcha(createCaptchaChallenge());
      setForm((current) => ({ ...current, startTime: '' }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible reservar la cita.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setSuccess(null);

    const validationError = validateReservation();
    if (validationError) {
      setMessage(validationError);
      return;
    }

    await submitReservation(!isPatientSession);
  };

  return (
    <div className="stack-lg">
      <section className="section-card">
        <div className="section-header between wrap">
          <div className="stack-sm">
            <span className="eyebrow">Reserva de citas</span>
            <h1>Agenda tu cita en línea</h1>
            <p className="muted-text">Primero verifica la cédula, luego completa los datos y confirma tu reserva.</p>
          </div>
        </div>
      </section>

      <form className="stack-lg" onSubmit={handleSubmit}>
        {!isPatientSession && (
          <section className="section-card stack-md">
            <h2>Paso 1. Verifica tu cédula</h2>
            <div className="guest-warning-panel">
              <div className="guest-warning-block">
                <span className="eyebrow">Modo invitado</span>
                <h3>Estás reservando sin iniciar sesión</h3>
                <p className="muted-text">Primero debes ingresar tu cédula para verificar si ya existe información previa. Si no existe, podrás completar tus datos manualmente.</p>
              </div>
              <div className="guest-warning-block guest-warning-block-accent">
                <span className="eyebrow">¿Ya tienes cuenta?</span>
                <h3>Inicia sesión para reservar más rápido</h3>
                <p className="muted-text">Con tu usuario podrás consultar tus citas, guardar tu perfil y evitar volver a escribir tus datos en cada reserva.</p>
                <div className="inline-actions wrap">
                  <Link className="button button-secondary" to="/iniciar-sesion">Iniciar sesión</Link>
                  <Link className="button" to="/crear-cuenta">Crear cuenta</Link>
                  <Link className="button button-secondary" to="/consultar-citas">Consultar citas</Link>
                </div>
              </div>
            </div>
            <div className="form-grid internal-filter-grid">
              <label>
                Número de cédula
                <input inputMode="numeric" maxLength={20} value={form.documentNumber} onChange={(event) => handleChange('documentNumber', event.target.value.replace(/\D/g, ''))} />
              </label>
              <div className="inline-actions end" style={{ alignItems: 'end' }}>
                <button type="button" className="button" onClick={verifyDocument} disabled={lookupLoading}>
                  {lookupLoading ? 'Verificando...' : 'Verificar cédula'}
                </button>
              </div>
            </div>
            {documentVerified && !patientLookup && <div className="feedback-card success">No encontramos esta cédula. Continúa llenando tus datos para reservar.</div>}
            {patientLookup && (
              <div className="feedback-card success">
                Encontramos información previa para <strong>{patientLookup.firstName} {patientLookup.lastName}</strong>. Nombre y género fueron rellenados; ingresa los datos de contacto para continuar.
              </div>
            )}
          </section>
        )}

        <section className="section-card stack-md">
          <h2>{isPatientSession ? 'Paso 1. Completa o confirma tus datos' : 'Paso 2. Completa tus datos'}</h2>
          <div className="form-grid">
            <label>
              Documento
              <input inputMode="numeric" maxLength={20} value={form.documentNumber} disabled={!isPatientSession} onChange={(event) => handleChange('documentNumber', event.target.value.replace(/\D/g, ''))} />
            </label>
            <label>
              Nombres
              <input maxLength={80} value={form.firstName} disabled={!isPatientSession && !documentVerified} onChange={(event) => handleChange('firstName', sanitizeNameInput(event.target.value))} />
            </label>
            <label>
              Apellidos
              <input maxLength={80} value={form.lastName} disabled={!isPatientSession && !documentVerified} onChange={(event) => handleChange('lastName', sanitizeNameInput(event.target.value))} />
            </label>
            <label>
              Celular
              <input inputMode="numeric" maxLength={15} value={form.phone} disabled={!isPatientSession && !documentVerified} onChange={(event) => handleChange('phone', event.target.value.replace(/\D/g, ''))} />
              {!isPatientSession && patientLookup?.maskedPhone && <small className="muted-text">Registrado: {patientLookup.maskedPhone}</small>}
            </label>
            <label>
              Género
              <select value={form.gender} disabled={!isPatientSession && !documentVerified} onChange={(event) => handleChange('gender', event.target.value)}>
                <option value="">Seleccionar género</option>
                <option value="Female">Mujer</option>
                <option value="Male">Hombre</option>
                <option value="Other">Otro</option>
              </select>
            </label>
            <label>
              Fecha de nacimiento
              <input type="date" value={form.birthDate} disabled={!isPatientSession && !documentVerified} onChange={(event) => handleChange('birthDate', event.target.value)} />
              {!isPatientSession && patientLookup?.birthYear && <small className="muted-text">Año registrado: {patientLookup.birthYear}</small>}
            </label>
            <label className="span-two">
              Correo electrónico (opcional)
              <input type="email" maxLength={150} value={form.email} disabled={!isPatientSession && !documentVerified} onChange={(event) => handleChange('email', event.target.value)} />
              {!isPatientSession && patientLookup?.maskedEmail && <small className="muted-text">Registrado: {patientLookup.maskedEmail}</small>}
            </label>
          </div>
        </section>

        <section className="section-card stack-md">
          <h2>{isPatientSession ? 'Paso 2. Selecciona el profesional y la fecha' : 'Paso 3. Selecciona el profesional y la fecha'}</h2>
          <div className="form-grid internal-filter-grid">
            <label>
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
              <input type="date" min={toLocalDateInputValue(new Date())} value={form.appointmentDate} onChange={(event) => handleChange('appointmentDate', event.target.value)} />
            </label>
          </div>
          {selectedProvider && <div className="summary-badge">{selectedProvider.fullName} · {selectedProvider.specialty}</div>}
        </section>

        <section className="section-card stack-md">
          <h2>{isPatientSession ? 'Paso 3. Elige una franja disponible' : 'Paso 4. Elige una franja disponible'}</h2>
          {form.appointmentDate && <p className="muted-text">Disponibilidad para {formatDateLabel(form.appointmentDate)}.</p>}
          {loadingSlots && <div className="loading-card">Consultando franjas disponibles...</div>}
          {!loadingSlots && (
            <div className="slot-grid">
              {slotAvailabilityMessage && <div className="empty-state">{slotAvailabilityMessage}</div>}
              {visibleSlots.map((slot) => (
                <button
                  key={`${slot.startTime}-${slot.endTime}`}
                  type="button"
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
          )}

          {!isPatientSession && documentVerified && !mustCreateAccount && (
            <div className="notice-card stack-sm">
              <div className="between wrap">
                <div>
                  <strong>Verificación anti-bots</strong>
                  <p className="muted-text">Antes de confirmar tu cita como invitado, resuelve esta operación.</p>
                </div>
                <button type="button" className="button button-secondary" onClick={() => setCaptcha(createCaptchaChallenge())}>Cambiar reto</button>
              </div>
              <div className="form-grid internal-filter-grid">
                <label>
                  ¿Cuánto es {captcha.left} + {captcha.right}?
                  <input inputMode="numeric" value={captcha.answer} onChange={(event) => setCaptcha((current) => ({ ...current, answer: event.target.value.replace(/\D/g, '') }))} />
                </label>
              </div>
            </div>
          )}

          {message && <div className="feedback-card error">{message}</div>}
          <div className="inline-actions end">
            <button type="submit" className="button" disabled={submitting}>
              {submitting ? 'Confirmando reserva...' : 'Confirmar reserva'}
            </button>
          </div>
        </section>
      </form>

      {success && (
      <div className="modal-backdrop" role="dialog" aria-modal="true">
        <section className="modal-card stack-md">
          <span className="eyebrow">Reserva confirmada</span>
          <h2>Tu cita fue registrada correctamente</h2>

          <div className="summary-grid">
            <div><span>Paciente</span><strong>{success.patientFullName}</strong></div>
            <div><span>Profesional</span><strong>{success.providerName}</strong></div>
            <div><span>Especialidad</span><strong>{success.specialty}</strong></div>
            <div><span>Fecha y hora</span><strong>{formatDateLabel(success.appointmentDate)} · {success.startTime}</strong></div>
          </div>

          {!isPatientSession && (
            <div className="notice-card">
              <strong>Importante</strong>
              <p className="muted-text">
                Solo puedes reservar una cita como invitado. Para una próxima reserva deberás registrarte.
                Guarda bien la información de esta cita, ya que por seguridad no se mostrará información sensible para recordarla después.
              </p>
            </div>
          )}

          <div className="inline-actions end wrap">
            <button type="button" className="button" onClick={() => {
              setSuccess(null);
              navigate(isPatientSession ? '/portal/paciente' : '/consultar-citas', { replace: true });
            }}>
              <button
              type="button"
              className="button"
              onClick={() => {
                setSuccess(null);
                navigate('/', { replace: true });
              }}
            >
              Ir al inicio
            </button>
            </button>
          </div>
        </section>
      </div>
    )}

    {guestLimitModal && (
      <div className="modal-backdrop" role="dialog" aria-modal="true">
        <section className="modal-card stack-md">
          <span className="eyebrow">Registro requerido</span>
          <h2>Ya usaste tu cita como invitado</h2>

          <p className="muted-text">
            Para reservar otra cita debes crear una cuenta. Por seguridad solo mostramos fecha y tipo de cita.
          </p>

          <div className="summary-grid">
            <div>
              <span>Fecha</span>
              <strong>{guestLimitModal.lastGuestAppointmentDate ?? 'No disponible'}</strong>
            </div>

            <div>
              <span>Tipo de cita</span>
              <strong>{guestLimitModal.lastGuestAppointmentType ?? 'No disponible'}</strong>
            </div>
          </div>

          <div className="inline-actions end wrap">
            <button type="button" className="button" onClick={() => navigate('/crear-cuenta')}>
              Registrar usuario
            </button>

            <button type="button" className="button button-secondary" onClick={() => setGuestLimitModal(null)}>
              Salir
            </button>
          </div>
        </section>
      </div>
    )}
    </div>
  );
}
