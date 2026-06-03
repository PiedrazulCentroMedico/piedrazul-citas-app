import type { ProviderSchedule, ProviderSummary, SystemSettings } from '../types';

export const demoProviderSummaries: ProviderSummary[] = [
  { id: 'demo-provider-laura-rivera', fullName: 'Laura Rivera', specialty: 'Psicología', defaultSlotIntervalMinutes: 60 },
  { id: 'demo-provider-andres-vega', fullName: 'Andres Vega', specialty: 'Medicina General', defaultSlotIntervalMinutes: 60 },
];

export const demoProviderSchedules: ProviderSchedule[] = [
  {
    providerId: 'demo-provider-laura-rivera',
    providerName: 'Laura Rivera',
    specialty: 'Psicología',
    defaultSlotIntervalMinutes: 60,
    weeklyAvailabilities: [
      { dayOfWeek: 2, startTime: '09:00', endTime: '12:00', slotIntervalMinutes: 60, isActive: true },
      { dayOfWeek: 5, startTime: '14:00', endTime: '17:00', slotIntervalMinutes: 60, isActive: true },
    ],
  },
  {
    providerId: 'demo-provider-andres-vega',
    providerName: 'Andres Vega',
    specialty: 'Medicina General',
    defaultSlotIntervalMinutes: 60,
    weeklyAvailabilities: [
      { dayOfWeek: 3, startTime: '09:00', endTime: '12:00', slotIntervalMinutes: 60, isActive: true },
      { dayOfWeek: 6, startTime: '08:00', endTime: '11:00', slotIntervalMinutes: 60, isActive: true },
    ],
  },
];

export const demoSystemSettings: SystemSettings = {
  weeksAheadBooking: 6,
  timeZoneId: 'America/Bogota',
};
