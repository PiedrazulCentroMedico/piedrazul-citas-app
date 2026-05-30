import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api/http';
import { useAuth } from '../auth/AuthContext';
import { PortalTabs } from '../components/PortalTabs';
import type { AppointmentListResponse, AppointmentResponse, AppointmentStatusValue, ProviderSummary } from '../types';
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

function printBlob(blob: Blob) {
  const url = window.URL.createObjectURL(blob);
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.src = url;
  document.body.appendChild(frame);
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => {
      document.body.removeChild(frame);
      window.URL.revokeObjectURL(url);
    }, 1000);
  };
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

function toLocalDateInputValue(dateValue: Date) {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, '0');
  const day = String(dateValue.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(dateValue: Date, days: number) {
  const copy = new Date(dateValue);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatShortDay(dateValue: Date) {
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(dateValue);
}

function buildDateOptions(offset: number) {
  const today = new Date();
  const startDate = addDays(today, offset);

  return Array.from({ length: 7 }, (_, index) => {
    const nextDate = addDays(startDate, index);
    return {
      value: toLocalDateInputValue(nextDate),
      label: formatShortDay(nextDate),
    };
  });
}

function pdfHexText(value: string) {
  const normalized = value.normalize('NFC');
  let hex = 'FEFF';
  for (let index = 0; index < normalized.length; index += 1) {
    hex += normalized.charCodeAt(index).toString(16).padStart(4, '0').toUpperCase();
  }
  return `<${hex}>`;
}

function buildSimplePdf(providerName: string, specialty: string, label: string, items: AppointmentResponse[]) {
  const text = (value: string, x: number, y: number, size = 10, font = 'F1') =>
    `BT /${font} ${size} Tf ${x} ${y} Td ${pdfHexText(value)} Tj ET`;
  const rect = (x: number, y: number, width: number, height: number, fill = '0.96 0.98 1 rg') =>
    `q ${fill} ${x} ${y} ${width} ${height} re f Q`;
  const stroke = (x: number, y: number, width: number, height: number) =>
    `q 0.82 0.87 0.93 RG ${x} ${y} ${width} ${height} re S Q`;

  const commands: string[] = [
    rect(0, 0, 595, 842, '1 1 1 rg'),
    rect(0, 756, 595, 86, '0.92 0.96 1 rg'),
    rect(36, 704, 523, 48, '0.98 0.99 1 rg'),
    text('Piedrazul Centro Médico', 40, 800, 18, 'F2'),
    text('Listado de citas médicas', 40, 778, 12, 'F1'),
    text(`Profesional: ${providerName}`.slice(0, 80), 52, 734, 10, 'F2'),
    text(`Especialidad: ${specialty}`.slice(0, 80), 52, 716, 10),
    text(`Fecha o rango: ${label}`, 330, 734, 10),
    text(`Total de citas: ${items.length}`, 330, 716, 10, 'F2'),
    rect(36, 670, 523, 28, '0.05 0.42 0.95 rg'),
    text('Fecha', 44, 680, 8, 'F2'),
    text('Hora', 104, 680, 8, 'F2'),
    text('Paciente', 158, 680, 8, 'F2'),
    text('Documento', 292, 680, 8, 'F2'),
    text('Celular', 362, 680, 8, 'F2'),
    text('Estado', 432, 680, 8, 'F2'),
    text('Canal', 505, 680, 8, 'F2'),
  ];

  let y = 646;
  items.slice(0, 24).forEach((appointment, index) => {
    if (index % 2 === 0) commands.push(rect(36, y - 7, 523, 24, '0.98 0.99 1 rg'));
    commands.push(stroke(36, y - 7, 523, 24));
    commands.push(text(String(appointment.appointmentDate), 44, y, 8));
    commands.push(text(`${appointment.startTime}-${appointment.endTime}`, 104, y, 8));
    commands.push(text(appointment.patientFullName.slice(0, 24), 158, y, 8));
    commands.push(text(appointment.documentNumber, 292, y, 8));
    commands.push(text(appointment.phone, 362, y, 8));
    commands.push(text(translateStatusLabel(appointment.status), 432, y, 8));
    commands.push(text(appointment.channel.slice(0, 12), 505, y, 8));
    y -= 24;
  });

  if (items.length > 24) {
    commands.push(text(`Se muestran 24 de ${items.length} citas. Exporta CSV o Excel para ver el listado completo.`, 40, 48, 9));
  }
  commands.push(text(`Generado: ${new Date().toLocaleString('es-CO')}`, 40, 28, 8));

  const content = commands.join('\n');
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 6 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${new TextEncoder().encode(content).length} >> stream\n${content}\nendstream endobj`,
    '6 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj',
  ];

  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object) => {
    offsets.push(body.length);
    body += `${object}\n`;
  });
  const xrefOffset = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([body], { type: 'application/pdf' });
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
  const [date, setDate] = useState(toLocalDateInputValue(new Date()));
  const [dateOffset, setDateOffset] = useState(0);
  const [useDateRange, setUseDateRange] = useState(false);
  const [rangeStart, setRangeStart] = useState(toLocalDateInputValue(new Date()));
  const [rangeEnd, setRangeEnd] = useState(toLocalDateInputValue(new Date()));
  const [results, setResults] = useState<AppointmentListResponse[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draftStatuses, setDraftStatuses] = useState<Record<string, AppointmentStatusValue>>({});

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
  const dateOptions = useMemo(() => buildDateOptions(dateOffset), [dateOffset]);

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

  const buildCurrentPdfBlob = async () => {
    if (!providerId) return null;
    if (useDateRange) {
      if (combinedItems.length === 0) {
        setMessage('Primero consulta las citas para exportarlas en PDF.');
        return null;
      }
      const label = `${rangeStart} a ${rangeEnd}`;
      return buildSimplePdf(selectedProvider?.fullName ?? 'Profesional', selectedProvider?.specialty ?? '', label, combinedItems);
    }

    if (combinedItems.length > 0) {
      return buildSimplePdf(selectedProvider?.fullName ?? 'Profesional', selectedProvider?.specialty ?? '', date, combinedItems);
    }

    return apiRequest<Blob>(`/api/internal/appointments/export/pdf?providerId=${providerId}&date=${date}`, session, { method: 'GET', responseType: 'blob' });
  };

  const downloadPdf = async () => {
    try {
      const blob = await buildCurrentPdfBlob();
      if (!blob) return;
      downloadBlob(blob, useDateRange ? `citas-${rangeStart}-a-${rangeEnd}.pdf` : `citas-${date}.pdf`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible descargar el PDF.');
    }
  };

  const printPdf = async () => {
    try {
      const blob = await buildCurrentPdfBlob();
      if (!blob) return;
      printBlob(blob);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible imprimir el PDF.');
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
            <div className="span-two stack-sm">
              <strong>Fecha</strong>
              <div className="date-strip" aria-label="Seleccionar fecha de consulta">
                <button type="button" className="date-strip-arrow" onClick={() => setDateOffset((current) => Math.max(0, current - 7))} disabled={dateOffset === 0} aria-label="Ver semana anterior">‹</button>
                <div className="date-strip-days">
                  {dateOptions.map((dateOption) => (
                    <button key={dateOption.value} type="button" className={`date-option ${date === dateOption.value ? 'selected' : ''}`} onClick={() => setDate(dateOption.value)}>
                      {dateOption.label.split(' ').map((part) => (<strong key={part}>{part}</strong>))}
                    </button>
                  ))}
                </div>
                <button type="button" className="date-strip-arrow" onClick={() => setDateOffset((current) => current + 7)} aria-label="Ver semana siguiente">›</button>
              </div>
              <p className="muted-text">Consultando citas para {formatDateLabel(date)}.</p>
            </div>
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
            <button type="button" className="button button-secondary" onClick={() => void downloadPdf()}>Descargar PDF</button>
            <button type="button" className="button button-secondary" onClick={() => void printPdf()}>Imprimir PDF</button>
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
                          </div>
                          {!started && selectedStatus !== 'Cancelada' && <small className="helper-text">Antes de la hora de atención solo puedes cambiar la cita a Cancelada.</small>}
                          {terminal && <small className="helper-text">Este estado ya no se puede modificar.</small>}
                        </td>
                      </tr>
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
    </div>
  );
}
