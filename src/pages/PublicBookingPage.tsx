import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../api/http';
import { useAuth } from '../auth/AuthContext';
import type { AppointmentResponse, AvailabilitySlot, CaptchaChallenge, Gender, GenderOption, PatientProfile, PatientPublicLookup, ProviderSummary, PublicAppointmentPayload } from '../types';
import { formatDateLabel, sanitizeNameInput, validatePatientForm } from '../utils/validators';
import { translateStatusLabel } from '../utils/status';

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
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(date);
}

function buildDateOptions(offset: number) {
  const today = new Date();
  const startDate = addDays(today, offset);

  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(startDate, index);
    return {
      value: toLocalDateInputValue(date),
      label: formatShortDay(date),
    };
  });
}

function createCaptchaChallenge(): CaptchaChallenge {
  const left = Math.floor(Math.random() * 8) + 2;
  const right = Math.floor(Math.random() * 8) + 1;
  return { left, right, answer: '' };
}

function looksLikeDemoEmail(value?: string | null) {
  if (!value) return false;
  return /(^paciente\.demo@piedrazul\.test$|@piedrazul\.local$)/i.test(value.trim());
}

function cleanOptionalEmail(value?: string | null) {
  return looksLikeDemoEmail(value) ? '' : (value ?? '');
}

function normalizeSpecialty(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
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
function scrollToElement(ref: React.RefObject<HTMLElement | null>, extraOffset = 18) {
  window.setTimeout(() => {
    const element = ref.current;
    if (!element) return;
    const headerHeight = document.querySelector('.topbar')?.getBoundingClientRect().height ?? 0;
    const top = element.getBoundingClientRect().top + window.scrollY - headerHeight - extraOffset;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, 120);
}


const initialForm = {
  providerId: '',
  appointmentDate: toLocalDateInputValue(new Date()),
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
  const [searchParams] = useSearchParams();
  const { session } = useAuth();
  const isPatientSession = session?.roles.includes('Patient') ?? false;
  const [form, setForm] = useState(initialForm);
  const [dateOffset, setDateOffset] = useState(0);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [selectedSpecialtyKey, setSelectedSpecialtyKey] = useState('');
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
  const [reprogramTarget, setReprogramTarget] = useState<AppointmentResponse | null>(null);
  const [registeredPatientModal, setRegisteredPatientModal] = useState<PatientPublicLookup | null>(null);
  const [documentNotice, setDocumentNotice] = useState<string | null>(null);
  const patientDataRef = useRef<HTMLElement | null>(null);
  const providerStepRef = useRef<HTMLElement | null>(null);
  const scheduleStepRef = useRef<HTMLElement | null>(null);
  const antiBotStepRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    apiRequest<ProviderSummary[]>('/api/public/providers', null)
      .then((data) => {
        setProviders(data);
        const specialties = buildUniqueSpecialties(data);
        if (specialties[0]) setSelectedSpecialtyKey((current) => current || specialties[0].key);
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
          email: cleanOptionalEmail(profile.email),
        }));
      })
      .catch(() => undefined);
  }, [isPatientSession, session]);

  useEffect(() => {
    const appointmentId = searchParams.get('reprogramar');
    if (!appointmentId || !isPatientSession || !session) {
      setReprogramTarget(null);
      return;
    }

    apiRequest<AppointmentResponse[]>('/api/patient/appointments', session)
      .then((items) => {
        const target = items.find((appointment) => appointment.id === appointmentId) ?? null;
        if (!target) {
          setMessage('No encontramos la cita que quieres reprogramar.');
          return;
        }
        if (translateStatusLabel(target.status) !== 'Programada') {
          setMessage('Esta cita ya no está programada y no se puede reprogramar.');
          return;
        }
        setReprogramTarget(target);
        setSelectedSpecialtyKey(normalizeSpecialty(target.specialty));
        setDateOffset(Math.floor(daysBetweenToday(target.appointmentDate) / 7) * 7);
        setForm((current) => ({
          ...current,
          providerId: target.providerId,
          appointmentDate: target.appointmentDate,
          startTime: '',
        }));
        window.setTimeout(() => scrollToElement(scheduleStepRef, 22), 250);
      })
      .catch((error: Error) => setMessage(error.message));
  }, [isPatientSession, searchParams, session]);

  useEffect(() => {
    if (!form.providerId || !form.appointmentDate) {
      setSlots([]);
      return;
    }

    setLoadingSlots(true);
    setMessage(null);

    const encodedDate = encodeURIComponent(form.appointmentDate);

    apiRequest<AvailabilitySlot[]>(
      `/api/public/providers/${form.providerId}/availability?date=${encodedDate}`,
      null,
    )
      .then((data) => {
        setSlots(data);
      })
      .catch((error: Error) => {
        setSlots([]);
        setMessage(error.message);
      })
      .finally(() => setLoadingSlots(false));
  }, [form.providerId, form.appointmentDate]);

  const selectedProvider = useMemo(() => providers.find((provider) => provider.id === form.providerId), [providers, form.providerId]);
  const specialtyOptions = useMemo(() => buildUniqueSpecialties(providers), [providers]);
  const selectedSpecialtyKeySafe = selectedSpecialtyKey || normalizeSpecialty(selectedProvider?.specialty ?? specialtyOptions[0]?.label ?? '');
  const filteredProviders = useMemo(
    () => providers.filter((provider) => normalizeSpecialty(provider.specialty) === selectedSpecialtyKeySafe),
    [providers, selectedSpecialtyKeySafe],
  );
  const dateOptions = useMemo(() => buildDateOptions(dateOffset), [dateOffset]);
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

  const reservationSummary = useMemo(() => ({
    patient: `${form.firstName} ${form.lastName}`.trim() || 'Paciente no confirmado',
    document: form.documentNumber || 'Documento no confirmado',
    professional: selectedProvider?.fullName ?? 'Profesional no seleccionado',
    specialty: selectedProvider?.specialty ?? 'Especialidad no seleccionada',
    date: form.appointmentDate ? formatDateLabel(form.appointmentDate) : 'Fecha no seleccionada',
    time: form.startTime ? `${form.startTime}${visibleSlots.find((slot) => slot.startTime === form.startTime)?.endTime ? ` - ${visibleSlots.find((slot) => slot.startTime === form.startTime)?.endTime}` : ''}` : 'Hora no seleccionada',
  }), [form.appointmentDate, form.documentNumber, form.firstName, form.lastName, form.startTime, selectedProvider, visibleSlots]);

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

      if (lookup.hasUserAccount) {
        setDocumentVerified(false);
        setPatientLookup(null);
        setDocumentNotice(null);
        setForm((current) => ({
          ...current,
          documentNumber,
          firstName: '',
          lastName: '',
          phone: '',
          gender: '' as GenderOption,
          birthDate: '',
          email: '',
        }));
        setRegisteredPatientModal(lookup);
        return;
      }

      if (lookup.mustRegister) {
        setDocumentVerified(false);
        setPatientLookup(null);
        setDocumentNotice(null);
        setForm((current) => ({
          ...current,
          documentNumber,
          firstName: '',
          lastName: '',
          phone: '',
          gender: '' as GenderOption,
          birthDate: '',
          email: '',
        }));
        setGuestLimitModal(lookup);
        return;
      }

      setDocumentNotice(lookup.exists
        ? `Encontramos información previa para ${lookup.firstName ?? ''} ${lookup.lastName ?? ''}. Completa los datos faltantes para continuar.`
        : 'No encontramos esta cédula. Continúa llenando tus datos para reservar.');
      window.setTimeout(() => {
        setDocumentNotice(null);
        scrollToElement(patientDataRef);
      }, 3000);

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

  const handleDataConfirmed = () => {
    if (!isPatientSession && !documentVerified) {
      setMessage('Primero verifica la cédula para continuar.');
      return;
    }

    const errors = validatePatientForm(form);
    if (!form.gender) errors.unshift('Selecciona un género para continuar.');
    if (errors.length > 0) {
      setMessage(errors[0]);
      return;
    }

    setMessage(null);
    scrollToElement(providerStepRef, 22);
  };

  const handleSpecialtySelected = (specialtyKey: string) => {
    setSelectedSpecialtyKey(specialtyKey);
    const firstProvider = providers.find((provider) => normalizeSpecialty(provider.specialty) === specialtyKey);
    if (firstProvider) {
      handleChange('providerId', firstProvider.id);
    }
  };

  const handleProviderSelected = (providerId: string) => {
    handleChange('providerId', providerId);
  };

  const handleProviderConfirmed = () => {
    if (!form.providerId) {
      setMessage('Selecciona un médico o terapista para continuar.');
      return;
    }
    setMessage(null);
    scrollToElement(scheduleStepRef, 22);
  };

  const handleScheduleConfirmed = () => {
    if (!form.appointmentDate) {
      setMessage('Selecciona una fecha para continuar.');
      return;
    }
    if (!form.startTime) {
      setMessage('Selecciona una hora disponible para continuar.');
      return;
    }
    if (reprogramTarget && form.appointmentDate === reprogramTarget.appointmentDate && form.startTime === reprogramTarget.startTime) {
      setMessage('Elige una fecha u hora diferente a la cita actual para poder reprogramar.');
      return;
    }
    setMessage(null);
    scrollToElement(antiBotStepRef, 22);
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
    if (reprogramTarget && form.appointmentDate === reprogramTarget.appointmentDate && form.startTime === reprogramTarget.startTime) {
      errors.push('Elige una fecha u hora diferente a la cita actual para poder reprogramar.');
    }

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
      email: cleanOptionalEmail(form.email) || null,
      bookAsGuest,
    };

    try {
      setSubmitting(true);
      const result = reprogramTarget && isPatientSession
        ? await apiRequest<AppointmentResponse>(`/api/patient/appointments/${reprogramTarget.id}/reschedule`, session, {
          method: 'PUT',
          body: {
            appointmentId: reprogramTarget.id,
            newProviderId: form.providerId,
            newDate: form.appointmentDate,
            newStartTime: form.startTime,
            reason: 'Reprogramación solicitada por paciente desde el portal web.',
          },
        })
        : await apiRequest<AppointmentResponse>(!bookAsGuest && isPatientSession ? '/api/patient/appointments' : '/api/public/appointments', session, {
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
            <h1>{reprogramTarget ? 'Reprograma tu cita' : 'Agenda tu cita en línea'}</h1>
            <p className="muted-text">{reprogramTarget ? 'Puedes cambiar el profesional, la fecha y la hora de esta cita. No se creará una cita adicional.' : 'Primero verifica la cédula, luego completa los datos y confirma tu reserva.'}</p>
            {reprogramTarget && (
              <div className="reprogram-current-card">
                <strong>Cita actual</strong>
                <span>{reprogramTarget.providerName} · {formatDateLabel(reprogramTarget.appointmentDate)} · {reprogramTarget.startTime} - {reprogramTarget.endTime}</span>
                <small>Puedes conservar este profesional o seleccionar otro antes de elegir la nueva fecha y hora.</small>
              </div>
            )}
          </div>
        </div>
      </section>

      <form className="stack-lg" onSubmit={handleSubmit}>
        {!isPatientSession && (
          <section className="section-card stack-md compact-booking-step">
            <h2>Paso 1. Verifica tu cédula</h2>
            <div className="form-grid id-check-grid">
              <label>
                Número de cédula
                <small className="field-helper">Escribe solo números, sin puntos ni espacios.</small>
                <input inputMode="numeric" maxLength={20} value={form.documentNumber} onChange={(event) => handleChange('documentNumber', event.target.value.replace(/\D/g, ''))} />
              </label>
              <div className="inline-actions align-end">
                <button type="button" className="button" onClick={verifyDocument} disabled={lookupLoading}>
                  {lookupLoading ? 'Verificando...' : 'Verificar cédula'}
                </button>
              </div>
            </div>
            <div className="guest-warning-panel guest-warning-panel-compact">
              <div className="guest-warning-block">
                <span className="eyebrow">Modo invitado</span>
                <h3>Reserva sin iniciar sesión</h3>
                <p className="muted-text">Verifica tu cédula. Si no existe, podrás completar tus datos manualmente.</p>
              </div>
              <div className="guest-warning-block guest-warning-block-accent">
                <span className="eyebrow">¿Ya tienes cuenta?</span>
                <h3>Reserva más rápido</h3>
                <p className="muted-text">Inicia sesión para consultar tus citas y evitar escribir tus datos de nuevo.</p>
                <div className="inline-actions wrap compact-actions">
                  <Link className="button button-secondary" to="/iniciar-sesion">Iniciar sesión</Link>
                  <Link className="button" to="/crear-cuenta">Crear cuenta</Link>
                </div>
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

        <section ref={patientDataRef} className="section-card stack-md">
          <h2>{isPatientSession ? 'Paso 1. Confirma tus datos' : 'Paso 2. Completa tus datos'}</h2>
          {isPatientSession ? (
            <>
              <div className="patient-confirm-row">
                <div><span>Documento</span><strong>{form.documentNumber || 'No registrado'}</strong></div>
                <div><span>Nombre</span><strong>{`${form.firstName} ${form.lastName}`.trim() || 'No registrado'}</strong></div>
                <div><span>Celular</span><strong>{form.phone || 'No registrado'}</strong></div>
                <div><span>Género</span><strong>{form.gender === 'Male' ? 'Hombre' : form.gender === 'Female' ? 'Mujer' : form.gender === 'Other' ? 'Otro' : 'No registrado'}</strong></div>
                <div><span>Fecha de nacimiento</span><strong>{form.birthDate || 'No registrada'}</strong></div>
                <div><span>Correo</span><strong>{cleanOptionalEmail(form.email) || 'No registrado'}</strong></div>
              </div>
              <div className="feedback-card warning">Si algún dato está mal, modifícalo desde <Link to="/portal/paciente/perfil"><strong>editar perfil</strong></Link> antes de confirmar la reserva.</div>
            </>
          ) : (
            <>
            {!documentVerified && (
              <div className="feedback-card warning">
                Verifica primero la cédula. Si ya existe una cuenta o una reserva previa como invitado, el sistema bloqueará estos campos y te guiará a iniciar sesión o crear cuenta.
              </div>
            )}
            <div className="form-grid">
              <label>
                Documento
                <small className="field-helper">Este dato se verifica primero y queda protegido.</small>
                <input inputMode="numeric" maxLength={20} value={form.documentNumber} disabled onChange={(event) => handleChange('documentNumber', event.target.value.replace(/\D/g, ''))} />
              </label>
              <label>
                Nombres
                <small className="field-helper">Escribe tus nombres como aparecen en el documento.</small>
                <input maxLength={80} value={form.firstName} disabled={!documentVerified} onChange={(event) => handleChange('firstName', sanitizeNameInput(event.target.value))} />
              </label>
              <label>
                Apellidos
                <small className="field-helper">Escribe tus apellidos completos.</small>
                <input maxLength={80} value={form.lastName} disabled={!documentVerified} onChange={(event) => handleChange('lastName', sanitizeNameInput(event.target.value))} />
              </label>
              <label>
                Celular
                <small className="field-helper">Usa un número activo para que Piedrazul pueda contactarte.</small>
                <input inputMode="numeric" maxLength={15} value={form.phone} disabled={!documentVerified} onChange={(event) => handleChange('phone', event.target.value.replace(/\D/g, ''))} />
                {patientLookup?.maskedPhone && <small className="muted-text">Registrado: {patientLookup.maskedPhone}</small>}
              </label>
              <label>
                Género
                <select value={form.gender} disabled={!documentVerified} onChange={(event) => handleChange('gender', event.target.value)}>
                  <option value="">Seleccionar género</option>
                  <option value="Female">Mujer</option>
                  <option value="Male">Hombre</option>
                  <option value="Other">Otro</option>
                </select>
              </label>
              <label>
                Fecha de nacimiento
                <input type="date" value={form.birthDate} disabled={!documentVerified} onChange={(event) => handleChange('birthDate', event.target.value)} />
                {patientLookup?.birthYear && <small className="muted-text">Año registrado: {patientLookup.birthYear}</small>}
              </label>
              <label className="span-two">
                Correo electrónico (opcional)
                <small className="field-helper">Sirve para recibir información, pero puedes dejarlo vacío.</small>
                <input type="email" maxLength={150} value={form.email} disabled={!documentVerified} onChange={(event) => handleChange('email', event.target.value)} />
                {patientLookup?.maskedEmail && <small className="muted-text">Registrado: {patientLookup.maskedEmail}</small>}
              </label>
            </div>
            </>
          )}
          <div className="inline-actions end">
            <button type="button" className="button" onClick={handleDataConfirmed}>Confirmar datos y continuar</button>
          </div>
        </section>

        <section ref={providerStepRef} className="section-card stack-md">
          <h2>{isPatientSession ? 'Paso 2. Selecciona el profesional' : 'Paso 3. Selecciona el profesional'}</h2>
          <p className="muted-text">Primero elige la especialidad y luego el profesional que atenderá la cita.</p>
          {reprogramTarget && <div className="selection-help">Estás reprogramando una cita existente. Puedes conservar el profesional actual o seleccionar otro disponible.</div>}

          <div className="selection-step-label">1. Selecciona especialidad</div>
          <div className="specialty-choice-grid" role="group" aria-label="Seleccionar especialidad">
            {specialtyOptions.map((specialty) => (
              <button
                key={specialty.key}
                type="button"
                className={`choice-card ${selectedSpecialtyKeySafe === specialty.key ? 'selected' : ''}`}
                onClick={() => handleSpecialtySelected(specialty.key)}
              >
                <span className="choice-check">{selectedSpecialtyKeySafe === specialty.key ? '✓' : ''}</span>
                <strong>{specialty.label}</strong>
              </button>
            ))}
          </div>

          <div className="selection-step-label">2. Selecciona médico</div>
          <div className="provider-choice-grid" role="group" aria-label="Seleccionar profesional">
            {filteredProviders.map((provider) => (
              <button
                key={provider.id}
                type="button"
                className={`provider-choice-card ${form.providerId === provider.id ? 'selected' : ''}`}
                onClick={() => handleProviderSelected(provider.id)}
              >
                <strong>{provider.fullName}</strong>
                <span>{provider.specialty}</span>
              </button>
            ))}
          </div>

          {selectedProvider && <div className="selection-help success-soft">Seleccionaste a <strong>{selectedProvider.fullName}</strong>. Confirma para continuar con la fecha y la hora.</div>}
          <div className="inline-actions end">
            <button type="button" className="button" onClick={handleProviderConfirmed}>Confirmar profesional y continuar</button>
          </div>
        </section>

        <section ref={scheduleStepRef} className="section-card stack-md">
          <h2>{isPatientSession ? 'Paso 3. Selecciona fecha y hora' : 'Paso 4. Selecciona fecha y hora'}</h2>
          <p className="muted-text">Selecciona primero el día de atención; luego marca una hora disponible para confirmar la cita.</p>
          <div className="color-legend" aria-label="Guía de colores y estados">
            <span><i className="legend-box legend-available" /> Disponible</span>
            <span><i className="legend-box legend-selected" /> Seleccionado</span>
            <span><i className="legend-box legend-unavailable" /> No disponible</span>
          </div>

          <div className="date-strip" aria-label="Seleccionar fecha de la cita">
            <button
              type="button"
              className="date-strip-arrow"
              onClick={() => setDateOffset((current) => Math.max(0, current - 7))}
              disabled={dateOffset === 0}
              aria-label="Ver fechas anteriores"
            >
              ‹
            </button>

            <div className="date-strip-days">
              {dateOptions.map((dateOption) => (
                <button
                  key={dateOption.value}
                  type="button"
                  className={`date-option ${form.appointmentDate === dateOption.value ? 'selected' : ''}`}
                  onClick={() => handleChange('appointmentDate', dateOption.value)}
                >
                  <strong>{dateOption.label}</strong>
                </button>
              ))}
            </div>

            <button
              type="button"
              className="date-strip-arrow"
              onClick={() => setDateOffset((current) => current + 7)}
              aria-label="Ver más fechas"
            >
              ›
            </button>
          </div>

          {form.appointmentDate && <div className="selection-help">Fecha seleccionada: <strong>{formatDateLabel(form.appointmentDate)}</strong>. Ahora selecciona una hora disponible.</div>}
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
            <>
            <div className="inline-actions end">
              <button type="button" className="button button-secondary" onClick={handleScheduleConfirmed}>Confirmar fecha y hora</button>
            </div>
            <div ref={antiBotStepRef} className="notice-card stack-sm">
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
            </>
          )}

          {form.startTime && (
            <div className="reservation-summary-card" aria-live="polite">
              <div>
                <span className="eyebrow">Revisa antes de confirmar</span>
                <h3>{reprogramTarget ? 'Nueva cita seleccionada' : 'Resumen de la cita'}</h3>
                <p className="muted-text">Confirma solo si la información es correcta.</p>
              </div>
              <div className="summary-grid">
                <div><span>Paciente:</span><strong>{reservationSummary.patient}</strong></div>
                <div><span>Documento:</span><strong>{reservationSummary.document}</strong></div>
                <div><span>Profesional:</span><strong>{reservationSummary.professional}</strong></div>
                <div><span>Especialidad:</span><strong>{reservationSummary.specialty}</strong></div>
                <div><span>Fecha:</span><strong>{reservationSummary.date}</strong></div>
                <div><span>Hora:</span><strong>{reservationSummary.time}</strong></div>
              </div>
            </div>
          )}

          {message && <div className="feedback-card error">{message}</div>}
          <div className="inline-actions end">
            <button type="submit" className="button" disabled={submitting}>
              {submitting ? 'Guardando...' : reprogramTarget ? 'Confirmar reprogramación' : 'Confirmar reserva'}
            </button>
          </div>
        </section>
      </form>

      <section className="section-card patient-help-section">
        <div className="section-header between wrap">
          <div>
            <span className="eyebrow">Sección de ayuda para pacientes</span>
            <h2>Preguntas frecuentes</h2>
            <p className="muted-text">Resuelve dudas rápidas sin salir del proceso.</p>
          </div>
          <a className="button button-secondary" href="https://wa.me/573001234567" target="_blank" rel="noreferrer">Ayuda por WhatsApp</a>
        </div>
        <div className="faq-grid">
          <details>
            <summary>¿Qué hago si no veo horarios?</summary>
            <p>Prueba con otra fecha o profesional. Si sigue sin aparecer disponibilidad, escribe por WhatsApp.</p>
          </details>
          <details>
            <summary>¿Puedo cambiar mi cita?</summary>
            <p>Sí. Desde Mis citas usa Reprogramar. El sistema conserva el historial y no crea una cita adicional.</p>
          </details>
          <details>
            <summary>¿Debo registrarme?</summary>
            <p>Para consultar y gestionar tus citas de forma segura, lo recomendado es tener cuenta de paciente.</p>
          </details>
          <details>
            <summary>¿Cómo identifico las opciones si no distingo bien los colores?</summary>
            <p>Usa el botón C de la ayuda visual. Además, las opciones tienen texto: Disponible, Seleccionado o No disponible.</p>
          </details>
        </div>
      </section>

      {documentNotice && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-card compact-modal stack-md">
            <span className="eyebrow">Verificación de cédula</span>
            <h2>{documentNotice}</h2>
            <p className="muted-text">Esta ventana se cerrará automáticamente y te llevará al paso de datos.</p>
          </section>
        </div>
      )}

      {success && (
      <div className="modal-backdrop" role="dialog" aria-modal="true">
        <section className="modal-card stack-md">
          <span className="eyebrow">{reprogramTarget ? 'Cita reprogramada' : 'Reserva confirmada'}</span>
          <h2>{reprogramTarget ? 'Tu cita fue reprogramada correctamente' : 'Tu cita fue registrada correctamente'}</h2>

          <div className="summary-grid">
            <div><span>Paciente:</span><strong>{success.patientFullName}</strong></div>
            <div><span>Profesional:</span><strong>{success.providerName}</strong></div>
            <div><span>Especialidad:</span><strong>{success.specialty}</strong></div>
            <div><span>Fecha y hora:</span><strong>{formatDateLabel(success.appointmentDate)} · {success.startTime}</strong></div>
          </div>

          <div className="notice-card appointment-tips">
            <strong>Recomendaciones para el día de la cita</strong>
            <ul>
              <li>Llega 10 minutos antes.</li>
              <li>Lleva tu documento de identidad.</li>
              <li>Si no puedes asistir, cancela o reprograma con anticipación.</li>
            </ul>
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
            <button
              type="button"
              className="button"
              onClick={() => {
                setSuccess(null);
                navigate(isPatientSession ? '/portal/paciente' : '/', { replace: true });
              }}
            >
              {isPatientSession ? 'Ir a mis citas' : 'Ir al inicio'}
            </button>
          </div>
        </section>
      </div>
    )}

    {registeredPatientModal && (
      <div className="modal-backdrop" role="dialog" aria-modal="true">
        <section className="modal-card stack-md">
          <span className="eyebrow">Cuenta encontrada</span>
          <h2>Esta cédula ya tiene una cuenta registrada</h2>
          <p className="muted-text">Para proteger tus datos e historial de citas, no puedes continuar como invitado. Te llevaremos al inicio de sesión con tu cédula ya escrita.</p>
          <div className="notice-card login-assist-card"><strong>Cédula detectada</strong><span>{form.documentNumber}</span></div>
          <div className="inline-actions end wrap">
            <button type="button" className="button" onClick={() => navigate('/iniciar-sesion', { state: { documentNumber: form.documentNumber, from: { pathname: '/reservar' } } })}>
              Iniciar sesión
            </button>
            <button type="button" className="button button-secondary" onClick={() => {
              setRegisteredPatientModal(null);
              setDocumentVerified(false);
              setPatientLookup(null);
            }}>
              Volver
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
            Ya existe una reserva previa como invitado. Para proteger tus datos, ahora debes crear una cuenta. Te llevaremos al registro con tu cédula ya escrita.
          </p>
          <div className="notice-card login-assist-card"><strong>Cédula detectada</strong><span>{form.documentNumber}</span></div>

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
            <button type="button" className="button" onClick={() => navigate('/crear-cuenta', { state: { documentNumber: form.documentNumber } })}>
              Crear cuenta
            </button>

            <button type="button" className="button button-secondary" onClick={() => {
              setGuestLimitModal(null);
              setDocumentVerified(false);
              setPatientLookup(null);
            }}>
              Salir
            </button>
          </div>
        </section>
      </div>
    )}
    </div>
  );
}
