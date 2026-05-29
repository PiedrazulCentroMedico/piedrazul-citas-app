import { appConfig } from '../config';
import type { AppointmentHistoryResponse, AppointmentResponse, RescheduleAppointmentRequest, SessionUser } from '../types';

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  responseType?: 'json' | 'blob';
}

function buildHeaders(session: SessionUser | null, headers?: HeadersInit) {
  const builtHeaders = new Headers(headers);

  if (!builtHeaders.has('Accept')) {
    builtHeaders.set('Accept', 'application/json');
  }

  if (session?.mode === 'keycloak' && session.token) {
    builtHeaders.set('Authorization', `Bearer ${session.token}`);
  }

  if (session?.mode === 'demo') {
    builtHeaders.set('X-Debug-Subject', session.subject);
    builtHeaders.set('X-Debug-Name', session.displayName);
    builtHeaders.set('X-Debug-Roles', session.roles.join(','));
    if (session.email) {
      builtHeaders.set('X-Debug-Email', session.email);
    }
  }

  return builtHeaders;
}

async function parseError(response: Response) {
  try {
    const data = await response.json();
    if (Array.isArray(data.errors)) {
      return data.errors.join(' ');
    }

    if (data.errors && typeof data.errors === 'object') {
      const flatErrors = Object.values(data.errors)
        .flatMap((value) => (Array.isArray(value) ? value : [String(value)]))
        .filter(Boolean);
      if (flatErrors.length > 0) {
        return flatErrors.join(' ');
      }
    }

    if (typeof data.detail === 'string' && data.detail.trim()) {
      return data.detail;
    }

    if (typeof data.title === 'string') {
      return data.title;
    }
  } catch {
    // ignore json parse errors
  }

  return `Ocurrió un error al procesar la solicitud (${response.status}).`;
}

export async function apiRequest<T>(path: string, session: SessionUser | null, options: RequestOptions = {}): Promise<T> {
  const { responseType = 'json', body, ...rest } = options;
  const headers = buildHeaders(session, rest.headers);

  let resolvedBody = body;
  if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob)) {
    headers.set('Content-Type', 'application/json');
    resolvedBody = JSON.stringify(body);
  }

  const response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
    ...rest,
    body: resolvedBody as BodyInit | null | undefined,
    headers,
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  if (responseType === 'blob') {
    return (await response.blob()) as T;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function getAppointmentHistory(session: SessionUser, appointmentId: string): Promise<AppointmentHistoryResponse[]> {
  return apiRequest<AppointmentHistoryResponse[]>(`/api/internal/appointments/${appointmentId}/history`, session);
}

export async function rescheduleAppointment(
  session: SessionUser,
  request: RescheduleAppointmentRequest,
): Promise<AppointmentResponse> {
  return apiRequest<AppointmentResponse>(
    `/api/internal/appointments/${request.appointmentId}/reschedule`,
    session,
    {
      method: 'PUT',
      body: {
        newDate: request.appointmentDate,
        newStartTime: request.startTime,
        reason: request.reason,
      },
    },
  );
}
