import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest, getAppointmentHistory, rescheduleAppointment } from '../api/http';
import { useAuth } from '../auth/AuthContext';
import { PortalTabs } from '../components/PortalTabs';
import type { AppointmentHistoryResponse, AppointmentListResponse, AppointmentResponse, AppointmentStatusValue, AvailabilitySlot, ProviderSummary } from '../types';
import { getLinkedProviderId } from '../utils/sessionStorage';
import { formatDateLabel, hasSettingsAccess, isDoctorRole } from '../utils/validators';
import { canTransitionStatus, hasAppointmentStarted, isTerminalStatus, translateStatusLabel } from '../utils/status';

function downloadBlob(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

function escapeCsvValue(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildCsvContent(items: AppointmentResponse[]) {
  const headers = ['Fecha', 'Hora inicio', 'Hora fin', 'Paciente', 'Documento', 'Celular', 'Profesional', 'Especialidad', 'Estado', 'Canal'];
  const rows = items.map((appointment) => [
    appointment.appointmentDate,
    appointment.startTime,
    appointment.endTime,
    appointment.patientFullName,
    appointment.documentNumber,
    appointment.phone,
    appointment.providerName,
    appointment.specialty,
    translateStatusLabel(appointment.status),
    appointment.channel,
  ]);
  return [headers, ...rows].map((row) => row.map((value) => escapeCsvValue(String(value ?? ''))).join(',')).join('\n');
}

function buildExcelTable(providerName: string, specialty: string, label: string, items: AppointmentResponse[]) {
  const rows = items.map((appointment) => `
    <tr>
      <td>${appointment.appointmentDate}</td>
      <td>${appointment.startTime}</td>
      <td>${appointment.endTime}</td>
      <td>${appointment.patientFullName}</td>
      <td>${appointment.documentNumber}</td>
      <td>${appointment.phone}</td>
      <td>${appointment.providerName}</td>
      <td>${appointment.specialty}</td>
      <td>${translateStatusLabel(appointment.status)}</td>
      <td>${appointment.channel}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
  <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
  <head><meta charset="UTF-8" /><title>Citas</title></head>
  <body>
    <table border="1">
      <tr><th colspan="10">Listado de citas - ${providerName} - ${specialty} - ${label}</th></tr>
      <tr><th>Fecha</th><th>Hora inicio</th><th>Hora fin</th><th>Paciente</th><th>Documento</th><th>Celular</th><th>Profesional</th><th>Especialidad</th><th>Estado</th><th>Canal</th></tr>
      ${rows}
    </table>
  </body>
  </html>`;
}

function getDatesInRange(start: string, end: string) {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00`);
  const final = new Date(`${end}T00:00:00`);
  while (cursor <= final) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export function InternalAppointmentsPage() {
  const { session } = useAuth();
  const isDoctor = isDoctorRole(session?.roles ?? []);
  const canManageUsers = session?.roles.includes('Admin') ?? false;
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [providerId, setProviderId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [useDateRange, setUseDateRange] = useState(false);
  const [rangeStart, setRangeStart] = useState(new Date().toISOString().slice(0, 10));
  const [rangeEnd, setRangeEnd] = useState(new Date().toISOString().slice(0, 10));
  const [results, setResults] = useState<AppointmentListResponse[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draftStatuses, setDraftStatuses] = useState<Record<string, AppointmentStatusValue>>({});
  const [rescheduling, setRescheduling] = useState<{ appointment: AppointmentResponse; date: string; startTime: string; reason: string } | null>(null);
  const [rescheduleSlots, setRescheduleSlots] = useState<AvailabilitySlot[]>([]);
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [historyMap, setHistoryMap] = useState<Record<string, AppointmentHistoryResponse[]>>({});
  const [loadingHistoryId, setLoadingHistoryId] = useState<string | null>(null);

  const tabs = useMemo(() => {
    const base = [{ to: '/portal/interno/citas', label: isDoctor ? 'Mis citas' : 'Listado de citas' }];
    if (!isDoctor) base.push({ to: '/portal/interno/nueva-cita', label: 'Nueva cita' });
    if (canManageUsers) base.push({ to: '/portal/interno/usuarios', label: 'Usuarios' });
    if (hasSettingsAccess(session?.roles ?? [])) base.push({ to: '/portal/interno/configuracion', label: 'Configuración' });
    if (isDoctor) base.push({ to: '/portal/interno/perfil', label: 'Mi perfil' });
    return base;
  }, [canManageUsers, isDoctor, session?.roles]);

  useEffect(() => {
    if (!session) return;
    apiRequest<ProviderSummary[]>('/api/public/providers', session)
      .then((data) => {
        const linkedProviderId = getLinkedProviderId(session.email);
        const filtered = isDoctor && linkedProviderId ? data.filter((item) => item.id === linkedProviderId) : data;
        setProviders(filtered);
        if (filtered[0]) setProviderId(filtered[0].id);
      })
      .catch((error: Error) => setMessage(error.message));
  }, [isDoctor, session]);

  const activeResults = useMemo(() => [...results].sort((a, b) => a.appointmentDate.localeCompare(b.appointmentDate)), [results]);
  const combinedItems = useMemo(() => activeResults.flatMap((r) => r.items).sort((a, b) => `${a.appointmentDate}${a.startTime}`.localeCompare(`${b.appointmentDate}${b.startTime}`)), [activeResults]);
  const selectedProvider = useMemo(() => providers.find((provider) => provider.id === providerId) ?? null, [providerId, providers]);

  const hydrateDraftStatuses = (items: AppointmentResponse[]) => {
    setDraftStatuses(Object.fromEntries(items.map((appointment) => [appointment.id, translateStatusLabel(appointment.status) as AppointmentStatusValue])));
  };

  const searchAppointments = async () => {
    if (!providerId) {
      setMessage(isDoctor ? 'No encontramos el profesional asociado a tu cuenta.' : 'Selecciona un profesional.');
      return;
    }
    if (useDateRange && rangeStart > rangeEnd) {
      setMessage('La fecha inicial no puede ser mayor que la fecha final.');
      return;
    }

    try {
      setLoading(true);
      setMessage(null);
      const datesToSearch = useDateRange ? getDatesInRange(rangeStart, rangeEnd) : [date];
      const data = await Promise.all(datesToSearch.map((dateValue) => apiRequest<AppointmentListResponse>(`/api/internal/appointments?providerId=${providerId}&date=${dateValue}`, session, { method: 'GET' })));
      setResults(data);
      hydrateDraftStatuses(data.flatMap((item) => item.items));
    } catch (error) {
      setResults([]);
      setMessage(error instanceof Error ? error.message : 'No fue posible consultar las citas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (providerId) void searchAppointments();
  }, [providerId]);

  useEffect(() => {
    if (!rescheduling?.date || !providerId) {
      setRescheduleSlots([]);
      return;
    }
    apiRequest<AvailabilitySlot[]>(`/api/public/providers/${providerId}/availability?date=${rescheduling.date}`, session)
      .then(setRescheduleSlots)
      .catch(() => setRescheduleSlots([]));
  }, [rescheduling?.date, providerId, session]);

  const downloadPdf = async () => {
    if (!providerId) return;
    if (useDateRange) {
      setMessage('La descarga en PDF está disponible solo para una fecha. Para rangos usa CSV o Excel.');
      return;
    }
    try {
      const blob = await apiRequest<Blob>(`/api/internal/appointments/export/pdf?providerId=${providerId}&date=${date}`, session, { method: 'GET', responseType: 'blob' });
      downloadBlob(blob, `citas-${date}.pdf`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible descargar el PDF.');
    }
  };

  const downloadCsv = () => {
    if (combinedItems.length === 0) {
      setMessage('Primero consulta las citas para exportarlas en CSV.');
      return;
    }
    const csv = buildCsvContent(combinedItems);
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), useDateRange ? `citas-${rangeStart}-a-${rangeEnd}.csv` : `citas-${date}.csv`);
  };

  const downloadExcel = async () => {
    if (!providerId) return;
    if (useDateRange) {
      // For ranges: generate client-side HTML XLS (backend endpoint only handles single date)
      if (combinedItems.length === 0) {
        setMessage('Primero consulta las citas para exportarlas en Excel.');
        return;
      }
      const label = `${rangeStart} a ${rangeEnd}`;
      const excel = buildExcelTable(selectedProvider?.fullName ?? 'Profesional', selectedProvider?.specialty ?? '', label, combinedItems);
      downloadBlob(new Blob([excel], { type: 'application/vnd.ms-excel' }), `citas-${rangeStart}-a-${rangeEnd}.xls`);
      return;
    }
    try {
      const blob = await apiRequest<Blob>(`/api/internal/appointments/export/xlsx?providerId=${providerId}&date=${date}`, session, { method: 'GET', responseType: 'blob' });
      downloadBlob(blob, `citas-${date}.xlsx`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible descargar el Excel.');
    }
  };

  const updateAppointmentStatus = async (appointmentId: string) => {
    const appointment = combinedItems.find((item) => item.id === appointmentId);
    const status = draftStatuses[appointmentId];
    if (!appointment || !status) return;
    if (!canTransitionStatus(appointment.status, status, appointment.appointmentDate, appointment.startTime)) {
      setMessage('Ese cambio de estado todavía no está permitido para esta cita.');
      return;
    }

    try {
      setSavingId(appointmentId);
      setMessage(null);
      const updated = await apiRequest<AppointmentResponse>(`/api/internal/appointments/${appointmentId}/status`, session, {
        method: 'PATCH',
        body: { status },
      });
      setResults((current) => current.map((result) => ({ ...result, items: result.items.map((item) => (item.id === updated.id ? updated : item)) })));
      setDraftStatuses((current) => ({ ...current, [appointmentId]: translateStatusLabel(updated.status) as AppointmentStatusValue }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible actualizar el estado de la cita.');
    } finally {
      setSavingId(null);
    }
  };

  const toggleHistory = async (appointmentId: string) => {
    if (expandedHistoryId === appointmentId) {
      setExpandedHistoryId(null);
      return;
    }
    setExpandedHistoryId(appointmentId);
    if (historyMap[appointmentId] !== undefined) return;
    try {
      setLoadingHistoryId(appointmentId);
      const history = await getAppointmentHistory(session!, appointmentId);
      setHistoryMap((current) => ({ ...current, [appointmentId]: history }));
    } catch {
      setHistoryMap((current) => ({ ...current, [appointmentId]: [] }));
    } finally {
      setLoadingHistoryId(null);
    }
  };

  const openRescheduleModal = (appointment: AppointmentResponse) => {
    setRescheduling({ appointment, date: appointment.appointmentDate, startTime: '', reason: '' });
    setRescheduleError(null);
  };

  const confirmReschedule = async () => {
    if (!rescheduling || !session || !rescheduling.startTime) {
      setRescheduleError('Selecciona una fecha y hora para reagendar.');
      return;
    }
    try {
      setRescheduleSubmitting(true);
      setRescheduleError(null);
      const updated = await rescheduleAppointment(session, {
        appointmentId: rescheduling.appointment.id,
        appointmentDate: rescheduling.date,
        startTime: rescheduling.startTime,
        reason: rescheduling.reason || undefined,
      });
      setResults((current) =>
        current.map((result) => ({
          ...result,
          items: result.items.map((item) => (item.id === updated.id ? updated : item)),
        })),
      );
      setDraftStatuses((current) => ({ ...current, [updated.id]: translateStatusLabel(updated.status) as AppointmentStatusValue }));
      setRescheduling(null);
      setMessage('La cita fue reagendada correctamente.');
    } catch (error) {
      setRescheduleError(error instanceof Error ? error.message : 'No fue posible reagendar la cita.');
    } finally {
      setRescheduleSubmitting(false);
    }
  };

  return (
    <div className="stack-lg">
      <section className="section-card">
        <h1>{isDoctor ? 'Mis citas programadas' : 'Listado de citas por profesional y fecha'}</h1>
        <p className="muted-text">{isDoctor ? 'Consulta tus citas asignadas, actualiza el estado cuando corresponda y exporta el listado del día.' : 'Busca rápidamente las citas programadas y revisa el total del día.'}</p>
      </section>

      <PortalTabs items={tabs} />

      <section className="section-card stack-md">
        <div className="inline-actions wrap range-toggle-row">
          <label className="checkbox-inline range-toggle-card">
            <input type="checkbox" checked={useDateRange} onChange={(event) => setUseDateRange(event.target.checked)} />
            Seleccionar varias fechas
          </label>
        </div>
        <div className="form-grid internal-filter-grid">
          <label>
            Profesional
            <select value={providerId} onChange={(event) => setProviderId(event.target.value)} disabled={isDoctor}>
              <option value="">Selecciona una opción</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.specialty} - {provider.fullName}</option>
              ))}
            </select>
          </label>

          {!useDateRange ? (
            <label>
              Fecha
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
          ) : (
            <>
              <label>
                Fecha inicial
                <input type="date" value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} />
              </label>
              <label>
                Fecha final
                <input type="date" value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} />
              </label>
            </>
          )}

          <div className="inline-actions end wrap">
            <button type="button" className="button" onClick={() => void searchAppointments()}>Buscar</button>
            <button type="button" className="button button-secondary" onClick={() => void downloadPdf()} disabled={useDateRange}>Descargar PDF</button>
            <button type="button" className="button button-secondary" onClick={downloadCsv}>CSV</button>
            <button type="button" className="button button-secondary" onClick={downloadExcel}>Excel</button>
          </div>
        </div>
      </section>

      {message && <div className={`feedback-card ${message.includes('correctamente') ? 'success' : 'error'}`}>{message}</div>}
      {loading && <div className="loading-card">Consultando citas...</div>}

      {!loading && activeResults.length > 0 && (
        <section className="section-card stack-md">
          <div className="section-header between wrap">
            <div>
              <h2>{selectedProvider?.fullName ?? activeResults[0]?.providerName}</h2>
              <p className="muted-text">{selectedProvider?.specialty ?? activeResults[0]?.specialty} · {useDateRange ? `${formatDateLabel(rangeStart)} a ${formatDateLabel(rangeEnd)}` : formatDateLabel(activeResults[0].appointmentDate)}</p>
            </div>
            <div className="summary-badge">Total de citas: {combinedItems.length}</div>
          </div>

          {combinedItems.length === 0 ? (
            <div className="empty-state">No hay citas registradas para los filtros actuales.</div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    {useDateRange && <th>Fecha</th>}
                    <th>Hora</th>
                    <th>Paciente</th>
                    <th>Documento</th>
                    <th>Celular</th>
                    <th>Canal</th>
                    <th>Estado</th>
                    <th>Actualizar estado</th>
                    <th>Historial</th>
                  </tr>
                </thead>
                <tbody>
                  {combinedItems.map((appointment) => {
                    const started = hasAppointmentStarted(appointment.appointmentDate, appointment.startTime);
                    const translatedStatus = translateStatusLabel(appointment.status);
                    const terminal = isTerminalStatus(appointment.status);
                    const selectedStatus = draftStatuses[appointment.id] ?? (translatedStatus as AppointmentStatusValue);
                    const canSaveStatus = canTransitionStatus(appointment.status, selectedStatus, appointment.appointmentDate, appointment.startTime);
                    return (
                      <>
                      <tr key={appointment.id}>
                        {useDateRange && <td>{formatDateLabel(appointment.appointmentDate)}</td>}
                        <td>{appointment.startTime} - {appointment.endTime}</td>
                        <td>{appointment.patientFullName}</td>
                        <td>{appointment.documentNumber}</td>
                        <td>{appointment.phone}</td>
                        <td>{appointment.channel}</td>
                        <td>{translatedStatus}</td>
                        <td>
                          <div className="inline-actions wrap">
                            <label htmlFor={`status-${appointment.id}`} className="sr-only">Cambiar estado de la cita</label>
                            <select
                              id={`status-${appointment.id}`}
                              aria-label={`Cambiar estado de la cita de ${appointment.patientFullName}`}
                              value={selectedStatus}
                              disabled={terminal || savingId === appointment.id}
                              onChange={(event) => setDraftStatuses((current) => ({ ...current, [appointment.id]: event.target.value as AppointmentStatusValue }))}
                            >
                              <option value="Programada">Programada</option>
                              <option value="Cancelada">Cancelada</option>
                              <option value="Completada">Completada</option>
                              <option value="No asistió">No asistió</option>
                            </select>
                            <button
                              type="button"
                              className="button button-secondary"
                              disabled={terminal || savingId === appointment.id || selectedStatus === translatedStatus || !canSaveStatus}
                              onClick={() => void updateAppointmentStatus(appointment.id)}
                            >
                              {savingId === appointment.id ? 'Guardando...' : 'Guardar'}
                            </button>
                            {!isDoctor && translatedStatus === 'Programada' && selectedStatus === translatedStatus && (
                              <button
                                type="button"
                                className="button button-secondary"
                                onClick={() => openRescheduleModal(appointment)}
                              >
                                Reagendar
                              </button>
                            )}
                          </div>
                          {!started && selectedStatus !== 'Cancelada' && <small className="helper-text">Antes de la hora de atención solo puedes cambiar la cita a Cancelada.</small>}
                          {terminal && <small className="helper-text">Este estado ya no se puede modificar.</small>}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="button button-secondary"
                            onClick={() => void toggleHistory(appointment.id)}
                          >
                            {loadingHistoryId === appointment.id ? 'Cargando...' : expandedHistoryId === appointment.id ? 'Ocultar' : 'Ver historial'}
                          </button>
                        </td>
                      </tr>
                      {expandedHistoryId === appointment.id && (
                        <tr key={`history-${appointment.id}`}>
                          <td colSpan={useDateRange ? 9 : 8} className="history-panel">
                            {loadingHistoryId === appointment.id ? (
                              <p className="muted-text">Cargando historial...</p>
                            ) : (historyMap[appointment.id] ?? []).length === 0 ? (
                              <p className="muted-text">Sin reagendamientos registrados.</p>
                            ) : (
                              <table className="history-table">
                                <thead>
                                  <tr>
                                    <th>Fecha y hora anterior</th>
                                    <th>Nueva fecha y hora</th>
                                    <th>Responsable</th>
                                    <th>Fecha del cambio</th>
                                    <th>Motivo</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(historyMap[appointment.id] ?? []).map((entry, index) => (
                                    <tr key={index}>
                                      <td>{formatDateLabel(entry.previousDate)} {entry.previousStartTime} – {entry.previousEndTime}</td>
                                      <td>{formatDateLabel(entry.newDate)} {entry.newStartTime} – {entry.newEndTime}</td>
                                      <td>{entry.changedBy}</td>
                                      <td>{new Date(entry.changedAtUtc).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                                      <td>{entry.reason ?? '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!isDoctor && (
            <div className="inline-actions end">
              <Link className="button button-secondary" to="/portal/interno/nueva-cita">Crear nueva cita</Link>
            </div>
          )}
        </section>
      )}

      {rescheduling && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card stack-md">
            <h2>Reagendar cita</h2>
            <p className="muted-text">
              {rescheduling.appointment.patientFullName} · {rescheduling.appointment.appointmentDate} {rescheduling.appointment.startTime}
            </p>
            <div className="form-grid">
              <label>
                Nueva fecha
                <input
                  type="date"
                  value={rescheduling.date}
                  onChange={(event) => setRescheduling((current) => current ? { ...current, date: event.target.value, startTime: '' } : null)}
                />
              </label>
              <label>
                Nueva hora
                <select
                  value={rescheduling.startTime}
                  onChange={(event) => setRescheduling((current) => current ? { ...current, startTime: event.target.value } : null)}
                  disabled={rescheduleSlots.length === 0}
                >
                  <option value="">Selecciona una hora</option>
                  {rescheduleSlots.filter((slot) => slot.available).map((slot) => (
                    <option key={slot.startTime} value={slot.startTime}>
                      {slot.startTime} – {slot.endTime}
                    </option>
                  ))}
                </select>
              </label>
              <label className="span-two">
                Motivo del cambio (opcional)
                <textarea
                  value={rescheduling.reason}
                  maxLength={500}
                  rows={3}
                  onChange={(event) => setRescheduling((current) => current ? { ...current, reason: event.target.value } : null)}
                  placeholder="Describe el motivo del reagendamiento..."
                />
              </label>
            </div>
            {rescheduleError && <div className="feedback-card error">{rescheduleError}</div>}
            <div className="inline-actions end wrap">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setRescheduling(null)}
                disabled={rescheduleSubmitting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="button"
                onClick={() => void confirmReschedule()}
                disabled={rescheduleSubmitting || !rescheduling.startTime}
              >
                {rescheduleSubmitting ? 'Guardando...' : 'Confirmar reagendamiento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
