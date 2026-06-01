import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { translateStatusLabel } from '../utils/status';
import { apiRequest } from '../api/http';
import { useAuth } from '../auth/AuthContext';
import { PortalTabs } from '../components/PortalTabs';
import type { AppointmentResponse } from '../types';
import { formatDateLabel } from '../utils/validators';

const tabs = [
  { to: '/portal/paciente', label: 'Mis citas' },
  { to: '/portal/paciente/perfil', label: 'Mi perfil' },
];

function isCancelledAppointment(appointment: AppointmentResponse) {
  return translateStatusLabel(appointment.status) === 'Cancelada';
}

function canCancelAppointment(appointment: AppointmentResponse) {
  if (translateStatusLabel(appointment.status) !== 'Programada') return false;
  const start = new Date(`${appointment.appointmentDate}T${appointment.startTime}:00`);
  return start.getTime() > Date.now();
}

export function PatientDashboardPage() {
  const { session } = useAuth();
  const [appointments, setAppointments] = useState<AppointmentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AppointmentResponse | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;

    apiRequest<AppointmentResponse[]>('/api/patient/appointments', session)
      .then(setAppointments)
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setLoading(false));
  }, [session]);

  const nextAppointment = useMemo(() => {
    return [...appointments]
      .sort((first, second) => `${first.appointmentDate}${first.startTime}`.localeCompare(`${second.appointmentDate}${second.startTime}`))
      .find((appointment) => new Date(`${appointment.appointmentDate}T${appointment.startTime}:00`).getTime() >= Date.now() && translateStatusLabel(appointment.status) === 'Programada');
  }, [appointments]);

  const confirmCancel = async () => {
    if (!session || !cancelTarget) return;

    try {
      setCancellingId(cancelTarget.id);
      setMessage(null);
      const updated = await apiRequest<AppointmentResponse>(`/api/patient/appointments/${cancelTarget.id}/cancel`, session, {
        method: 'PATCH',
      });
      setAppointments((current) => current.map((appointment) => (appointment.id === updated.id ? updated : appointment)));
      setMessage('La cita fue cancelada correctamente.');
      setCancelTarget(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible cancelar la cita.');
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="stack-lg">
      <section className="section-card">
        <h1>Portal del paciente</h1>
        <p className="muted-text">Bienvenido, {session?.displayName}. Desde aquí puedes revisar tus citas, cancelar o reprogramar sin crear una cita nueva.</p>
      </section>

      <PortalTabs items={tabs} />

      <section className="grid-two">
        <article className="section-card">
          <h2>Próxima cita</h2>
          {nextAppointment ? (
            <div className="stack-sm">
              <strong>{nextAppointment.providerName}</strong>
              <span>{nextAppointment.specialty}</span>
              <span>{formatDateLabel(nextAppointment.appointmentDate)} · {nextAppointment.startTime}</span>
            </div>
          ) : (
            <p className="muted-text">Aún no tienes una próxima cita registrada.</p>
          )}
        </article>

        <article className="section-card">
          <h2>Acciones rápidas</h2>
          <div className="inline-actions wrap">
            <Link className="button" to="/reservar">Reservar nueva cita</Link>
            <Link className="button button-secondary" to="/portal/paciente/perfil">Actualizar perfil</Link>
            <a className="button button-secondary" href="https://wa.me/573001234567" target="_blank" rel="noreferrer">Ayuda por WhatsApp</a>
          </div>
        </article>
      </section>

      <section className="section-card">
        <h2>Mis citas</h2>
        {loading && <div className="loading-card">Cargando citas...</div>}
        {message && <div className={`feedback-card ${message.includes('correctamente') ? 'success' : 'error'}`}>{message}</div>}
        {!loading && !message && appointments.length === 0 && <div className="empty-state">No hay citas registradas todavía.</div>}
        {!loading && appointments.length > 0 && (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Hora</th>
                  <th>Profesional</th>
                  <th>Especialidad</th>
                  <th>Estado</th>
                  <th>Canal</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((appointment) => {
                  const cancellable = canCancelAppointment(appointment);
                  return (
                    <tr key={appointment.id} className={isCancelledAppointment(appointment) ? 'appointment-row-cancelled' : undefined}>
                      <td data-label="Fecha">{formatDateLabel(appointment.appointmentDate)}</td>
                      <td data-label="Hora">{appointment.startTime} - {appointment.endTime}</td>
                      <td data-label="Profesional">{appointment.providerName}</td>
                      <td data-label="Especialidad">{appointment.specialty}</td>
                      <td data-label="Estado"><span className={`status-pill status-${translateStatusLabel(appointment.status).toLowerCase()}`}>{translateStatusLabel(appointment.status)}</span></td>
                      <td data-label="Canal">{appointment.channel}</td>
                      <td data-label="Acciones">
                        <div className="inline-actions wrap">
                          {cancellable && (
                            <button type="button" className="button button-ghost" onClick={() => setCancelTarget(appointment)}>
                              Cancelar cita
                            </button>
                          )}
                          {translateStatusLabel(appointment.status) === 'Programada' && (
                            <Link className="button button-secondary" to={`/reservar?reprogramar=${appointment.id}`}>
                              Reprogramar cita
                            </Link>
                          )}
                          {!cancellable && translateStatusLabel(appointment.status) !== 'Programada' && <span className="helper-text">Sin acciones</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section-card patient-help-section">
        <div className="section-header between wrap">
          <div>
            <span className="eyebrow">Ayuda para pacientes</span>
            <h2>Preguntas frecuentes</h2>
            <p className="muted-text">Guía rápida para gestionar tus citas.</p>
          </div>
        </div>
        <div className="faq-grid">
          <details>
            <summary>¿Cómo reprogramo sin crear otra cita?</summary>
            <p>Usa el botón Reprogramar cita en una cita programada. El sistema conserva el profesional y solo te pide nueva fecha y hora.</p>
          </details>
          <details>
            <summary>¿Qué significan los estados?</summary>
            <p>Programada está activa, Cancelada ya no se atenderá y Reagendada indica que tuvo cambios de fecha u hora.</p>
          </details>
          <details>
            <summary>¿Qué llevo a la cita?</summary>
            <p>Llega 10 minutos antes y lleva tu documento de identidad.</p>
          </details>
        </div>
      </section>

      {cancelTarget && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
          <div className="modal-card stack-md">
            <div className="stack-sm">
              <span className="eyebrow eyebrow-warning">Confirmación</span>
              <h2 id="cancel-title">¿Deseas cancelar esta cita?</h2>
              <p className="muted-text">
                {cancelTarget.providerName} · {formatDateLabel(cancelTarget.appointmentDate)} · {cancelTarget.startTime} - {cancelTarget.endTime}
              </p>
              <p className="muted-text">Esta acción cambiará el estado de la cita a Cancelada.</p>
            </div>
            <div className="inline-actions end wrap">
              <button type="button" className="button button-secondary" onClick={() => setCancelTarget(null)} disabled={cancellingId === cancelTarget.id}>
                Volver
              </button>
              <button type="button" className="button button-ghost" onClick={() => void confirmCancel()} disabled={cancellingId === cancelTarget.id}>
                {cancellingId === cancelTarget.id ? 'Cancelando...' : 'Confirmar cancelación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
