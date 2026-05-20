const digitsOnly = /^\d+$/;
const personName = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü' -]+$/;

export function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function sanitizeNameInput(value: string) {
  return value.replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñÜü' -]/g, '').replace(/\s+/g, ' ');
}

export function validatePatientForm(data: {
  documentNumber: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  birthDate?: string | null; 
}) {
  const errors: string[] = [];
  const documentNumber = normalizeText(data.documentNumber);
  const firstName = normalizeText(data.firstName);
  const lastName = normalizeText(data.lastName);
  const phone = normalizeText(data.phone);
  const email = normalizeText(data.email ?? '');

  if (!digitsOnly.test(documentNumber) || documentNumber.length < 5 || documentNumber.length > 20) {
    errors.push('El documento debe contener solo números y tener entre 5 y 20 dígitos.');
  }

  if (!personName.test(firstName) || firstName.length < 2 || firstName.length > 80) {
    errors.push('Los nombres solo pueden contener letras, espacios, comillas simples o guiones.');
  }

  if (!personName.test(lastName) || lastName.length < 2 || lastName.length > 80) {
    errors.push('Los apellidos solo pueden contener letras, espacios, comillas simples o guiones.');
  }

  if (!digitsOnly.test(phone) || phone.length !== 10) {
    errors.push('El celular debe contener exactamente 10 dígitos.');
  }

  if (email && (email.length > 150 || !/^\S+@\S+\.\S+$/.test(email))) {
    errors.push('El correo electrónico no tiene un formato válido.');
  }
    if (data.birthDate) {
    const birth = new Date(data.birthDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minYear = today.getFullYear() - 120;

    if (isNaN(birth.getTime())) {
      errors.push('La fecha de nacimiento no es válida.');
    } else if (birth > today) {
      errors.push('La fecha de nacimiento no puede ser una fecha futura.');
    } else if (birth.getFullYear() < minYear) {
      errors.push('La fecha de nacimiento no parece válida.');
    }
  }
  return errors;
}

export function validateStrongPassword(value: string) {
  const trimmed = value.trim();
  const hasUppercase = /[A-ZÁÉÍÓÚÑÜ]/.test(trimmed);
  const hasLowercase = /[a-záéíóúñü]/.test(trimmed);
  const hasDigit = /\d/.test(trimmed);
  const hasSpecial = /[^A-Za-zÁÉÍÓÚáéíóúÑñÜü0-9]/.test(trimmed);
  const minLength = trimmed.length >= 8;

  return {
    minLength,
    hasUppercase,
    hasLowercase,
    hasDigit,
    hasSpecial,
    isValid: minLength && hasUppercase && hasLowercase && (hasDigit || hasSpecial),
  };
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours * 60) + minutes;
}

export function validateAvailabilityEntries(entries: Array<{
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotIntervalMinutes: number;
  isActive: boolean;
}>) {
  const errors: string[] = [];

  entries.forEach((entry, index) => {
    if (!entry.isActive) return;

    const start = timeToMinutes(entry.startTime);
    const end = timeToMinutes(entry.endTime);
    const duration = end - start;
    const label = `Franja ${index + 1}`;

    if (Number.isNaN(start) || Number.isNaN(end)) {
      errors.push(`${label}: debes indicar una hora de inicio y fin válidas.`);
      return;
    }

    if (start >= end) {
      errors.push(`${label}: la hora de fin debe ser posterior a la hora de inicio.`);
    }

    if (!Number.isInteger(entry.slotIntervalMinutes) || entry.slotIntervalMinutes < 10 || entry.slotIntervalMinutes > 120) {
      errors.push(`${label}: el intervalo debe estar entre 10 y 120 minutos.`);
    }

    if (duration > 0 && entry.slotIntervalMinutes > duration) {
      errors.push(`${label}: el intervalo no puede ser mayor que la duración de la franja.`);
    }

    if (duration > 0 && duration % entry.slotIntervalMinutes !== 0) {
      errors.push(`${label}: el intervalo debe dividir exactamente la duración de la franja.`);
    }
  });

  const activeByDay = new Map<number, Array<{ index: number; start: number; end: number }>>();
  entries.forEach((entry, index) => {
    if (!entry.isActive) return;
    const current = activeByDay.get(entry.dayOfWeek) ?? [];
    current.push({ index, start: timeToMinutes(entry.startTime), end: timeToMinutes(entry.endTime) });
    activeByDay.set(entry.dayOfWeek, current);
  });

  activeByDay.forEach((items) => {
    const sorted = [...items].sort((first, second) => first.start - second.start);
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1];
      const current = sorted[i];
      if (current.start < previous.end) {
        errors.push(`Las franjas ${previous.index + 1} y ${current.index + 1} se cruzan en el mismo día.`);
      }
    }
  });

  return errors;
}

export function hasInternalAccess(roles: string[]) {
  return roles.some((role) => ['Admin', 'Scheduler', 'Doctor'].includes(role));
}

export function hasSettingsAccess(roles: string[]) {
  return roles.includes('Admin') || roles.includes('Doctor');
}

export function isDoctorRole(roles: string[]) {
  return roles.includes('Doctor');
}

export function formatDateLabel(value: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${value}T00:00:00`));
}
