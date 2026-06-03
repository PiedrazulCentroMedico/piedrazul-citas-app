import type { AuthMode } from './config';

export type Gender = 'Male' | 'Female' | 'Other';
export type InternalRole = 'Admin' | 'Scheduler' | 'Doctor';
export type DemoRole = 'patient' | 'admin' | 'scheduler' | 'doctor';
export type GenderOption = Gender | '';
export type AppointmentStatusValue = 'Programada' | 'Cancelada' | 'Completada' | 'No asistió';


export interface SessionUser {
  subject: string;
  displayName: string;
  email?: string;
  roles: string[];
  mode: AuthMode;
  token?: string;
}

export interface CenterInfo {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  attentionHours: string;
  about: string;
}

export interface ProviderSummary {
  id: string;
  fullName: string;
  specialty: string;
  defaultSlotIntervalMinutes: number;
}

export interface AvailabilitySlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

export interface AppointmentResponse {
  id: string;
  providerId: string;
  providerName: string;
  specialty: string;
  patientFullName: string;
  documentNumber: string;
  phone: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: string;
  channel: string;
  notes?: string | null;
}


export interface AppointmentHistoryResponse {
  appointmentId: string;
  previousDate: string;
  previousStartTime: string;
  previousEndTime: string;
  newDate: string;
  newStartTime: string;
  newEndTime: string;
  reason?: string | null;
  changedBy: string;
  changedAtUtc: string;
}

export interface AppointmentListResponse {
  providerName: string;
  specialty: string;
  appointmentDate: string;
  total: number;
  items: AppointmentResponse[];
}

export interface PatientProfile {
  id: string;
  documentNumber: string;
  firstName: string;
  lastName: string;
  phone: string;
  gender: Gender;
  birthDate?: string | null;
  email?: string | null;
  isGuest: boolean;
}

export interface PublicAppointmentPayload {
  providerId: string;
  appointmentDate: string;
  startTime: string;
  documentNumber: string;
  firstName: string;
  lastName: string;
  phone: string;
  gender: Gender;
  birthDate?: string | null;
  email?: string | null;
  bookAsGuest: boolean;
}

export interface InternalAppointmentPayload {
  providerId: string;
  appointmentDate: string;
  startTime: string;
  documentNumber: string;
  firstName: string;
  lastName: string;
  phone: string;
  gender: Gender;
  birthDate?: string | null;
  email?: string | null;
  notes?: string;
  channel: string;
}

export interface PatientLookup {
  id: string;
  documentNumber: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  gender: Gender;
  birthDate?: string | null;
  email?: string | null;
  scheduledAppointmentsCount?: number;
  hasUserAccount?: boolean;
}

export interface PatientPublicLookup {
  exists: boolean;
  id?: string;
  firstName?: string;
  lastName?: string;
  gender?: Gender;
  maskedPhone?: string;
  maskedEmail?: string;
  birthYear?: number;
  hasUserAccount?: boolean;
  mustRegister: boolean;
  lastGuestAppointmentDate?: string | null;
  lastGuestAppointmentType?: string | null;
}

export interface SystemSettings {
  weeksAheadBooking: number;
  timeZoneId: string;
}

export interface WeeklyAvailability {
  id?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotIntervalMinutes: number;
  isActive: boolean;
}

export interface ProviderSchedule {
  providerId: string;
  providerName: string;
  specialty: string;
  defaultSlotIntervalMinutes: number;
  weeklyAvailabilities: WeeklyAvailability[];
}

export interface ProviderSchedulePayload {
  firstName: string;
  lastName: string;
  specialty: string;
  defaultSlotIntervalMinutes: number;
  weeklyAvailabilities: WeeklyAvailability[];
}

export interface CreateDoctorPayload {
  documentNumber: string;
  firstName: string;
  lastName: string;
  specialty: string;
  defaultSlotIntervalMinutes: number;
  email: string;
  password: string;
}

export interface CaptchaChallenge {
  left: number;
  right: number;
  answer: string;
}

export interface UpdateAppointmentStatusPayload {
  status: AppointmentStatusValue;
}
