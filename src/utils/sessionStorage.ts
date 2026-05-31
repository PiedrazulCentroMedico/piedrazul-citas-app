const DOCTOR_LINKS_STORAGE_KEY = 'piedrazul-doctor-links';
const REGISTER_DRAFT_STORAGE_KEY = 'piedrazul-register-draft';

export interface DoctorLinkMap {
  [email: string]: string;
}

export interface RegisterDraft {
  documentNumber?: string;
  firstName: string;
  lastName: string;
  email?: string;
}

export function readDoctorLinks(): DoctorLinkMap {
  try {
    const raw = localStorage.getItem(DOCTOR_LINKS_STORAGE_KEY);
    return raw ? JSON.parse(raw) as DoctorLinkMap : {};
  } catch {
    return {};
  }
}

export function linkDoctorToProvider(email: string, providerId: string) {
  const links = readDoctorLinks();
  links[email.trim().toLowerCase()] = providerId;
  localStorage.setItem(DOCTOR_LINKS_STORAGE_KEY, JSON.stringify(links));
}

export function getLinkedProviderId(email?: string) {
  if (!email) return null;
  const links = readDoctorLinks();
  return links[email.trim().toLowerCase()] ?? null;
}

export function saveRegisterDraft(draft: RegisterDraft) {
  localStorage.setItem(REGISTER_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

export function readRegisterDraft(): RegisterDraft | null {
  try {
    const raw = localStorage.getItem(REGISTER_DRAFT_STORAGE_KEY);
    return raw ? JSON.parse(raw) as RegisterDraft : null;
  } catch {
    return null;
  }
}

export function clearRegisterDraft() {
  localStorage.removeItem(REGISTER_DRAFT_STORAGE_KEY);
}


const DEFAULT_DOCTOR_PROVIDER_LINKS: Record<string, string[]> = {
  'ana@piedrazul.local': ['ana gómez', 'ana gomez'],
  'laura@piedrazul.local': ['laura rivera'],
  'carlos@piedrazul.local': ['carlos martínez', 'carlos martinez'],
  'andres@piedrazul.local': ['andres vega', 'andrés vega'],
  'medico@piedrazul.local': ['ana gómez', 'ana gomez'],
};

function normalizeProviderName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function linkDefaultSeededDoctors(providers: Array<{ id?: string; providerId?: string; fullName?: string; providerName?: string }>) {
  const links = readDoctorLinks();
  let changed = false;

  Object.entries(DEFAULT_DOCTOR_PROVIDER_LINKS).forEach(([email, possibleNames]) => {
    if (links[email]) return;
    const normalizedNames = possibleNames.map(normalizeProviderName);
    const provider = providers.find((item) => {
      const id = item.id ?? item.providerId;
      const name = item.fullName ?? item.providerName ?? '';
      return Boolean(id) && normalizedNames.includes(normalizeProviderName(name));
    });

    const providerId = provider?.id ?? provider?.providerId;
    if (providerId) {
      links[email] = providerId;
      changed = true;
    }
  });

  if (changed) {
    localStorage.setItem(DOCTOR_LINKS_STORAGE_KEY, JSON.stringify(links));
  }
}
