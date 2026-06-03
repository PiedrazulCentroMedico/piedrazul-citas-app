export interface InternalDirectoryAccount {
  email?: string;
  documentNumber?: string;
  password: string;
  displayName: string;
  subject: string;
  roles: string[];
}

const ACCOUNTS_STORAGE_KEY = 'piedrazul-accounts';
const RETIRED_DEMO_LOCAL_PARTS = ['a' + 'na', 'car' + 'los'];
const REMOVED_DEMO_ACCOUNT_KEYS = new Set([
  ...RETIRED_DEMO_LOCAL_PARTS.flatMap((name) => [
    `${name}@piedrazul.local`,
    `staff-${name}@piedrazul.local`,
  ]),
  '900000004',
  '900000006',
  'paciente@piedrazul.local',
  'demo-patient',
  '1000000001',
  'medico@piedrazul.local',
  'staff-medico@piedrazul.local',
  '900000003',
]);

function isRemovedDemoAccount(account: InternalDirectoryAccount) {
  return [account.email, account.subject, account.documentNumber]
    .filter(Boolean)
    .some((value) => REMOVED_DEMO_ACCOUNT_KEYS.has(String(value).trim().toLowerCase()));
}

export function readInternalDirectory(): InternalDirectoryAccount[] {
  const stored = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored) as InternalDirectoryAccount[];
    const cleaned = parsed.filter((account) => !isRemovedDemoAccount(account));
    if (cleaned.length !== parsed.length) {
      saveInternalDirectory(cleaned);
    }
    return cleaned;
  } catch {
    return [];
  }
}

export function saveInternalDirectory(accounts: InternalDirectoryAccount[]) {
  localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
}
