import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, Workspace } from '@fintech/shared';
import { api, ApiClientError } from '../lib/api-client';

type AuthStatus = 'idle' | 'authenticating' | 'authenticated' | 'error';

interface AuthContextValue {
  readonly status: AuthStatus;
  readonly session: Session | null;
  readonly token: string | null;
  readonly workspaces: readonly Workspace[];
  readonly activeWorkspace: Workspace | null;
  readonly error: string | null;
  signIn(): Promise<void>;
  signOut(): void;
  switchWorkspace(workspaceId: string): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'fintech.session';

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(async (): Promise<void> => {
    setStatus('authenticating');
    setError(null);
    try {
      const next = await api.signIn();
      setSession(next);
      setActiveWorkspaceId(next.activeWorkspaceId);
      setStatus('authenticated');
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (cause) {
      setStatus('error');
      setError(cause instanceof ApiClientError ? cause.message : 'Sign-in failed. Try again');
    }
  }, []);

  const signOut = useCallback((): void => {
    sessionStorage.removeItem(STORAGE_KEY);
    setSession(null);
    setActiveWorkspaceId(null);
    setStatus('idle');
  }, []);

  const switchWorkspace = useCallback(
    (workspaceId: string): void => {
      if (!session?.workspaces.some((w) => w.id === workspaceId)) return;
      setActiveWorkspaceId(workspaceId);
    },
    [session],
  );

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) {
      void signIn();
      return;
    }
    try {
      const parsed: unknown = JSON.parse(stored);
      if (isSession(parsed) && new Date(parsed.expiresAt) > new Date()) {
        setSession(parsed);
        setActiveWorkspaceId(parsed.activeWorkspaceId);
        setStatus('authenticated');
        return;
      }
    } catch {
    }
    sessionStorage.removeItem(STORAGE_KEY);
    void signIn();
  }, [signIn]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      token: session?.token ?? null,
      workspaces: session?.workspaces ?? [],
      activeWorkspace: session?.workspaces.find((w) => w.id === activeWorkspaceId) ?? null,
      error,
      signIn,
      signOut,
      switchWorkspace,
    }),
    [status, session, activeWorkspaceId, error, signIn, signOut, switchWorkspace],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.token === 'string' &&
    typeof candidate.expiresAt === 'string' &&
    Array.isArray(candidate.workspaces)
  );
}
