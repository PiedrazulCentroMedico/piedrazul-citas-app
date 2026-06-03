import Keycloak from 'keycloak-js';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { apiRequest } from '../api/http';
import { appConfig } from '../config';
import type { DemoRole, SessionUser } from '../types';
import { hashPassword, verifyPassword } from '../utils/passwordHash';

const PATIENT_SESSION_STORAGE_KEY = 'piedrazul-patient-session';
const INTERNAL_SESSION_STORAGE_KEY = 'piedrazul-internal-session';
const ACCOUNTS_STORAGE_KEY = 'piedrazul-accounts';
const ACCOUNTS_VERSION_KEY = 'piedrazul-accounts-seeded';
const RESET_STORAGE_KEY = 'piedrazul-password-reset';

interface DemoAccount {
  email?: string;
  documentNumber?: string;
  password: string;
  displayName: string;
  subject: string;
  roles: string[];
}

interface ResetRequest {
  identifier: string;
  code: string;
  expiresAt: number;
}

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

function isRemovedDemoAccount(account: DemoAccount) {
  return [account.email, account.subject, account.documentNumber]
    .filter(Boolean)
    .some((value) => REMOVED_DEMO_ACCOUNT_KEYS.has(String(value).trim().toLowerCase()));
}

function isRemovedDemoSession(session: SessionUser | null) {
  if (!session) return false;
  return [session.email, session.subject]
    .filter(Boolean)
    .some((value) => REMOVED_DEMO_ACCOUNT_KEYS.has(String(value).trim().toLowerCase()));
}

interface RegisterPayload {
  documentNumber: string;
  firstName: string;
  lastName: string;
  password: string;
}

interface InternalAccountPayload {
  documentNumber: string;
  email: string;
  password: string;
  displayName: string;
  roles: string[];
}

interface AuthContextValue {
  ready: boolean;
  session: SessionUser | null;
  authMode: 'demo' | 'keycloak';
  login: (portal?: 'patient' | 'internal') => Promise<void>;
  register: () => Promise<void>;
  logout: () => Promise<void>;
  loginAsDemo: (role: DemoRole) => void;
  loginWithCredentials: (identifier: string, password: string, portal: 'patient' | 'internal') => Promise<SessionUser>;
  registerPatientAccount: (payload: RegisterPayload) => Promise<SessionUser>;
  createInternalDemoAccount: (payload: InternalAccountPayload) => Promise<void>;
  requestPasswordReset: (identifier: string) => Promise<string>;
  resetPassword: (identifier: string, code: string, newPassword: string) => Promise<void>;
  changeOwnPassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const seededAccounts: DemoAccount[] = [
  {
    email: 'admin@piedrazul.local',
    documentNumber: '900000001',
    password: 'Admin123*',
    displayName: 'Administrador Piedrazul',
    subject: 'staff-admin@piedrazul.local',
    roles: ['Admin'],
  },
  {
    email: 'agenda@piedrazul.local',
    documentNumber: '900000002',
    password: 'Agenda123*',
    displayName: 'Agendador Piedrazul',
    subject: 'staff-agenda@piedrazul.local',
    roles: ['Scheduler'],
  },
  {
    email: 'laura@piedrazul.local',
    documentNumber: '900000005',
    password: 'Laura123*',
    displayName: 'Laura Rivera',
    subject: 'staff-laura@piedrazul.local',
    roles: ['Doctor'],
  },
  {
    email: 'andres@piedrazul.local',
    documentNumber: '900000007',
    password: 'Andres123*',
    displayName: 'Andres Vega',
    subject: 'staff-andres@piedrazul.local',
    roles: ['Doctor'],
  },
];

const demoSessions: Record<DemoRole, SessionUser> = {
  patient: {
    subject: 'patient-demo-disabled',
    displayName: 'Paciente',
    roles: ['Patient'],
    mode: 'demo',
  },
  admin: {
    subject: 'staff-admin@piedrazul.local',
    displayName: 'Administrador Piedrazul',
    email: 'admin@piedrazul.local',
    roles: ['Admin'],
    mode: 'demo',
  },
  scheduler: {
    subject: 'staff-agenda@piedrazul.local',
    displayName: 'Agendador Piedrazul',
    email: 'agenda@piedrazul.local',
    roles: ['Scheduler'],
    mode: 'demo',
  },
  doctor: {
    subject: 'staff-laura@piedrazul.local',
    displayName: 'Laura Rivera',
    email: 'laura@piedrazul.local',
    roles: ['Doctor'],
    mode: 'demo',
  },
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function mapKeycloakSession(instance: Keycloak): SessionUser {
  const token = instance.token;
  const parsed = instance.tokenParsed as Record<string, unknown> | undefined;
  const realmAccess = parsed?.realm_access as { roles?: string[] } | undefined;

  return {
    subject: String(parsed?.sub ?? 'authenticated-user'),
    displayName: String(parsed?.preferred_username ?? parsed?.name ?? 'Usuario autenticado'),
    email: parsed?.email ? String(parsed.email) : undefined,
    roles: realmAccess?.roles ?? [],
    mode: 'keycloak',
    token,
  };
}

async function initAccounts(): Promise<void> {
  const existing = readAccounts().filter((account) => !isRemovedDemoAccount(account));
  const hashedSeeds = await Promise.all(
    seededAccounts.map(async (seed) => ({ ...seed, password: await hashPassword(seed.password) })),
  );

  const merged = [...existing];
  for (const seed of hashedSeeds) {
    const index = merged.findIndex((item) => {
      const sameEmail = seed.email && item.email && item.email.toLowerCase() === seed.email.toLowerCase();
      const sameDocument = seed.documentNumber && item.documentNumber === seed.documentNumber;
      const sameSubject = item.subject === seed.subject;
      return Boolean(sameEmail || sameDocument || sameSubject);
    });

    if (index === -1) {
      merged.push(seed);
      continue;
    }

    // Conserva la contraseña existente para no borrar cambios ni pacientes registrados al actualizar versión.
    merged[index] = {
      ...seed,
      ...merged[index],
      email: merged[index].email ?? seed.email,
      documentNumber: merged[index].documentNumber ?? seed.documentNumber,
      displayName: merged[index].displayName || seed.displayName,
      subject: merged[index].subject || seed.subject,
      roles: merged[index].roles?.length ? merged[index].roles : seed.roles,
    };
  }

  saveAccounts(merged);
  localStorage.setItem(ACCOUNTS_VERSION_KEY, '1');
}

function readAccounts(): DemoAccount[] {
  const stored = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored) as DemoAccount[];
  } catch {
    return [];
  }
}

function saveAccounts(accounts: DemoAccount[]) {
  localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
}

function createSession(account: DemoAccount): SessionUser {
  return {
    subject: account.subject,
    displayName: account.displayName,
    email: account.email,
    roles: account.roles,
    mode: 'demo',
  };
}

function readStoredSession(key: string): SessionUser | null {
  const stored = localStorage.getItem(key);
  if (!stored) return null;

  try {
    return JSON.parse(stored) as SessionUser;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function saveStoredSession(key: string, session: SessionUser | null) {
  if (!session) {
    localStorage.removeItem(key);
    return;
  }

  localStorage.setItem(key, JSON.stringify(session));
}

function readResetRequests(): ResetRequest[] {
  const stored = localStorage.getItem(RESET_STORAGE_KEY);
  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored) as ResetRequest[];
    return parsed.filter((item) => item.expiresAt > Date.now());
  } catch {
    return [];
  }
}

function saveResetRequests(items: ResetRequest[]) {
  localStorage.setItem(RESET_STORAGE_KEY, JSON.stringify(items.filter((item) => item.expiresAt > Date.now())));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isInternalRoute = location.pathname.startsWith('/portal/interno');
  const [ready, setReady] = useState(false);
  const [patientSession, setPatientSession] = useState<SessionUser | null>(null);
  const [internalSession, setInternalSession] = useState<SessionUser | null>(null);
  const [keycloak, setKeycloak] = useState<Keycloak | null>(null);

  useEffect(() => {
    if (appConfig.authMode === 'keycloak') {
      const keycloakInstance = new Keycloak({
        url: appConfig.keycloakUrl,
        realm: appConfig.keycloakRealm,
        clientId: appConfig.keycloakClientId,
      });

      keycloakInstance
        .init({
          onLoad: 'check-sso',
          pkceMethod: 'S256',
          checkLoginIframe: false,
        })
        .then((authenticated) => {
          setKeycloak(keycloakInstance);
          if (authenticated) {
            const mapped = mapKeycloakSession(keycloakInstance);
            if (mapped.roles.includes('Patient')) setPatientSession(mapped);
            if (mapped.roles.some((role) => ['Admin', 'Scheduler', 'Doctor'].includes(role))) setInternalSession(mapped);
          }

          keycloakInstance.onTokenExpired = () => {
            keycloakInstance
              .updateToken(30)
              .then(() => {
                const mapped = mapKeycloakSession(keycloakInstance);
                setPatientSession(mapped.roles.includes('Patient') ? mapped : null);
                setInternalSession(mapped.roles.some((role) => ['Admin', 'Scheduler', 'Doctor'].includes(role)) ? mapped : null);
              })
              .catch(() => {
                setPatientSession(null);
                setInternalSession(null);
              });
          };

          setReady(true);
        })
        .catch(() => setReady(true));
      return;
    }

    initAccounts().then(() => {
      const storedPatientSession = readStoredSession(PATIENT_SESSION_STORAGE_KEY);
      const storedInternalSession = readStoredSession(INTERNAL_SESSION_STORAGE_KEY);

      if (isRemovedDemoSession(storedPatientSession)) {
        saveStoredSession(PATIENT_SESSION_STORAGE_KEY, null);
        setPatientSession(null);
      } else {
        setPatientSession(storedPatientSession);
      }

      if (isRemovedDemoSession(storedInternalSession)) {
        saveStoredSession(INTERNAL_SESSION_STORAGE_KEY, null);
        setInternalSession(null);
      } else {
        setInternalSession(storedInternalSession);
      }

      setReady(true);
    });
  }, []);

  const session = isInternalRoute ? internalSession : patientSession;

  useEffect(() => {
    if (!patientSession && !internalSession) return;

    let timeoutId = window.setTimeout(() => {
      saveStoredSession(PATIENT_SESSION_STORAGE_KEY, null);
      saveStoredSession(INTERNAL_SESSION_STORAGE_KEY, null);
      setPatientSession(null);
      setInternalSession(null);
      window.location.href = '/';
    }, 20 * 60 * 1000);

    const resetTimer = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        saveStoredSession(PATIENT_SESSION_STORAGE_KEY, null);
        saveStoredSession(INTERNAL_SESSION_STORAGE_KEY, null);
        setPatientSession(null);
        setInternalSession(null);
        window.location.href = '/';
      }, 20 * 60 * 1000);
    };

    const events: Array<keyof WindowEventMap> = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }));

    return () => {
      window.clearTimeout(timeoutId);
      events.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
    };
  }, [internalSession, patientSession]);

  const value = useMemo<AuthContextValue>(() => ({
    ready,
    session,
    authMode: appConfig.authMode,
    async login(portal = 'patient') {
      if (appConfig.authMode === 'keycloak' && keycloak) {
        await keycloak.login({
          redirectUri: `${window.location.origin}${portal === 'internal' ? '/portal/interno/citas' : '/portal/paciente'}`,
        });
      }
    },
    async register() {
      if (appConfig.authMode === 'keycloak' && keycloak) {
        await keycloak.register({ redirectUri: `${window.location.origin}/portal/paciente/perfil` });
      }
    },
    async logout() {
      if (appConfig.authMode === 'keycloak' && keycloak) {
        await keycloak.logout({ redirectUri: window.location.origin });
        return;
      }

      // Cierra ambas sesiones locales para que un rol no herede la última ruta ni estado de otro rol.
      saveStoredSession(PATIENT_SESSION_STORAGE_KEY, null);
      saveStoredSession(INTERNAL_SESSION_STORAGE_KEY, null);
      setPatientSession(null);
      setInternalSession(null);
    },
    loginAsDemo(role) {
      const demoSession = demoSessions[role];
      if (role === 'patient') {
        saveStoredSession(PATIENT_SESSION_STORAGE_KEY, demoSession);
        setPatientSession(demoSession);
        return;
      }

      saveStoredSession(INTERNAL_SESSION_STORAGE_KEY, demoSession);
      setInternalSession(demoSession);
    },
    async loginWithCredentials(identifier, password, portal) {
      if (appConfig.authMode === 'keycloak') {
        if (keycloak) {
          await keycloak.login({
            redirectUri: `${window.location.origin}${portal === 'internal' ? '/portal/interno/citas' : '/portal/paciente'}`,
          });
        }
        throw new Error('Redirigiendo al sistema de autenticación...');
      }

      const normalizedIdentifier = identifier.trim().toLowerCase();
      const normalizedPassword = password.trim();
      const account = readAccounts().find((item) => {
        const isPatientAccount = item.roles.includes('Patient');
        if (portal === 'patient') {
          return isPatientAccount && item.documentNumber === normalizedIdentifier;
        }
        return !isPatientAccount && (item.email ?? '').toLowerCase() === normalizedIdentifier;
      });

      const passwordMatch = account ? await verifyPassword(normalizedPassword, account.password) : false;
      if (!account || !passwordMatch) {
        throw new Error(portal === 'patient'
          ? 'Cédula o contraseña incorrectas. Verifica tus datos e inténtalo de nuevo.'
          : 'Correo corporativo o contraseña incorrectos. Verifica tus credenciales e inténtalo de nuevo.');
      }

      const isPatientAccount = account.roles.includes('Patient');
      if (portal === 'patient' && !isPatientAccount) {
        throw new Error('Estas credenciales pertenecen al portal interno. Usa el acceso para personal autorizado.');
      }

      if (portal === 'internal' && isPatientAccount) {
        throw new Error('Estas credenciales pertenecen al portal de pacientes. Usa iniciar sesión desde el portal público.');
      }

      const newSession = createSession(account);
      if (isPatientAccount) {
        saveStoredSession(PATIENT_SESSION_STORAGE_KEY, newSession);
        setPatientSession(newSession);
      } else {
        saveStoredSession(INTERNAL_SESSION_STORAGE_KEY, newSession);
        setInternalSession(newSession);
      }

      return newSession;
    },
    async registerPatientAccount(payload) {
      if (appConfig.authMode === 'keycloak') {
        if (keycloak) {
          await keycloak.register({ redirectUri: `${window.location.origin}/portal/paciente/perfil` });
        }
        throw new Error('Redirigiendo al registro centralizado...');
      }

      const normalizedDocument = payload.documentNumber.trim();
      const accounts = readAccounts();
      if (accounts.some((item) => item.roles.includes('Patient') && item.documentNumber === normalizedDocument)) {
        throw new Error('Ya existe una cuenta con esa cédula. Inicia sesión para continuar.');
      }

      const displayName = `${payload.firstName.trim()} ${payload.lastName.trim()}`.trim();
      const account: DemoAccount = {
        documentNumber: normalizedDocument,
        password: await hashPassword(payload.password.trim()),
        displayName,
        subject: `patient-${normalizedDocument}`,
        roles: ['Patient'],
      };

      saveAccounts([...accounts, account]);
      const newSession = createSession(account);
      saveStoredSession(PATIENT_SESSION_STORAGE_KEY, newSession);
      setPatientSession(newSession);
      return newSession;
    },
    async createInternalDemoAccount(payload) {
      if (appConfig.authMode === 'keycloak') {
        const currentSession = internalSession;
        if (!currentSession) throw new Error('Sesión no disponible.');
        await apiRequest<{ id: string }>('/api/admin/internal-users', currentSession, {
          method: 'POST',
          body: {
            username: payload.email.trim().toLowerCase(),
            email: payload.email.trim().toLowerCase(),
            firstName: payload.displayName.split(' ')[0] ?? payload.displayName,
            lastName: payload.displayName.split(' ').slice(1).join(' ') || payload.displayName,
            password: payload.password,
            roles: payload.roles,
          documentNumber: payload.documentNumber,
          },
        });
        return;
      }

      const normalizedEmail = (() => {
        const base = payload.email.trim().toLowerCase();
        if (base.endsWith('@piedrazul.local')) return base;
        const localPart = base.includes('@') ? base.split('@')[0] : base;
        return `${localPart}@piedrazul.local`;
      })();
      const accounts = readAccounts();
      if (accounts.some((item) => (item.email ?? '').toLowerCase() === normalizedEmail)) {
        throw new Error('Ya existe una cuenta interna con ese correo.');
      }

      const account: DemoAccount = {
        email: normalizedEmail,
        documentNumber: payload.documentNumber.trim(),
        password: await hashPassword(payload.password.trim()),
        displayName: payload.displayName.trim(),
        subject: `staff-${normalizedEmail}`,
        roles: payload.roles,
      };

      saveAccounts([...accounts, account]);
    },
    async requestPasswordReset(identifier) {
      const normalizedIdentifier = identifier.trim().toLowerCase();
      const account = readAccounts().find((item) => {
        if (item.roles.includes('Patient')) {
          return item.documentNumber === normalizedIdentifier;
        }
        return (item.documentNumber ?? '') === normalizedIdentifier;
      });

      if (!account) {
        throw new Error('No encontramos una cuenta asociada al dato ingresado.');
      }

      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      const code = String(100000 + (buf[0] % 900000));
      const requests = readResetRequests().filter((item) => item.identifier !== normalizedIdentifier);
      requests.push({ identifier: normalizedIdentifier, code, expiresAt: Date.now() + 15 * 60 * 1000 });
      saveResetRequests(requests);
      return code;
    },

    async changeOwnPassword(currentPassword, newPassword) {
      if (appConfig.authMode === 'keycloak') {
        throw new Error('El cambio de contraseña debe realizarse desde el proveedor de identidad configurado.');
      }

      const currentSession = internalSession ?? patientSession;
      if (!currentSession) {
        throw new Error('No hay una sesión activa para cambiar la contraseña.');
      }

      const normalizedCurrentPassword = currentPassword.trim();
      const normalizedNewPassword = newPassword.trim();
      const accounts = readAccounts();
      const accountIndex = accounts.findIndex((item) => {
        const sameSubject = item.subject === currentSession.subject;
        const sameEmail = currentSession.email && item.email?.toLowerCase() === currentSession.email.toLowerCase();
        return Boolean(sameSubject || sameEmail);
      });

      if (accountIndex === -1) {
        throw new Error('No encontramos la cuenta asociada a tu sesión.');
      }

      const validCurrentPassword = await verifyPassword(normalizedCurrentPassword, accounts[accountIndex].password);
      if (!validCurrentPassword) {
        throw new Error('La contraseña actual no es correcta.');
      }

      if (normalizedNewPassword.length < 8) {
        throw new Error('La nueva contraseña debe tener mínimo 8 caracteres.');
      }

      accounts[accountIndex] = { ...accounts[accountIndex], password: await hashPassword(normalizedNewPassword) };
      saveAccounts(accounts);
    },
    async resetPassword(identifier, code, newPassword) {
      const normalizedIdentifier = identifier.trim().toLowerCase();
      const requests = readResetRequests();
      const existing = requests.find((item) => item.identifier === normalizedIdentifier && item.code === code.trim());
      if (!existing) {
        throw new Error('El código de recuperación no es válido o ya expiró.');
      }

      const accounts = readAccounts();
      const accountIndex = accounts.findIndex((item) => item.roles.includes('Patient')
        ? item.documentNumber === normalizedIdentifier
        : (item.documentNumber ?? '') === normalizedIdentifier);
      if (accountIndex === -1) {
        throw new Error('La cuenta asociada al restablecimiento ya no existe.');
      }

      accounts[accountIndex] = { ...accounts[accountIndex], password: await hashPassword(newPassword) };
      saveAccounts(accounts);
      saveResetRequests(requests.filter((item) => !(item.identifier === normalizedIdentifier && item.code === code.trim())));
    },
  }), [internalSession, isInternalRoute, keycloak, ready, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }

  return context;
}
