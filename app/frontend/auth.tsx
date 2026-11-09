import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import type { AuthUser } from './types';
import {
  MODALITA_INCORPORATA,
  attesaPrimaDelRinnovo,
  creaPonte,
  leggiConfigSSO,
  raccogliTokenAnticipati,
  scambiaToken,
  type Ponte,
} from './lib/embed';

type AuthMode = 'google' | 'invite_code' | 'none';

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: (tokenOverride?: string) => Promise<AuthUser | null>;
  setToken: (token?: string) => void;
  updateUser: (updater: (prev: AuthUser | null) => AuthUser | null) => void;
  token?: string;
  authMode: AuthMode;
  /** true quando il comparatore gira dentro PrevidenzaPro */
  embedded: boolean;
  /** messaggio da mostrare se l'accesso incorporato non riesce */
  embedError: string | null;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const env = (import.meta as any).env as Record<string, string> | undefined;
const API_BASE = (env && env.VITE_API_BASE) || 'http://localhost:8000';
const TOKEN_STORAGE_KEY = 'app.authToken';

function readStoredToken(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  // Incorporati non si riparte mai da un token salvato: la sessione la chiediamo
  // ogni volta alla piattaforma che ci ospita.
  if (MODALITA_INCORPORATA) return undefined;
  try {
    const stored = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    return stored || undefined;
  } catch (err) {
    console.warn('[Auth] Unable to read stored token:', err);
    return undefined;
  }
}

async function fetchMe(token?: string): Promise<AuthUser | null> {
  try {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    
    // If token provided, use it as Bearer auth
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const res = await fetch(`${API_BASE}/auth/me`, {
      credentials: 'include', // Always send cookies too
      headers,
    });
    
    if (!res.ok) return null;
    const data = await res.json();
    const plan = typeof data.plan === 'string' ? data.plan.toLowerCase() : 'free';
    const normalizedPlan = plan === 'full-access' ? 'full-access' : 'free';
    const roles = data.roles || [];
    const isAdmin = roles.includes('admin');
    return { ...data, plan: normalizedPlan, isAdmin } as AuthUser;
  } catch (e) {
    console.warn('[Auth] fetchMe error:', e);
    return null;
  }
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionToken, setSessionToken] = useState<string | undefined>(() => {
    return readStoredToken();
  });
  const [authMode, setAuthMode] = useState<AuthMode>('google');
  const [authConfigLoaded, setAuthConfigLoaded] = useState(false);
  const [embedError, setEmbedError] = useState<string | null>(null);
  const userRef = React.useRef<AuthUser | null>(null);
  const ponteRef = React.useRef<Ponte | null>(null);

  const persistToken = (token?: string) => {
    setSessionToken(token);
    if (typeof window !== 'undefined') {
      // Dentro un iframe la sessione resta in memoria: l'archiviazione del
      // browser puo essere separata per sito e il token non deve sopravvivere
      // alla chiusura della scheda.
      if (MODALITA_INCORPORATA) {
        if (token) (window as any).__APP_OAUTH_TOKEN = token;
        else delete (window as any).__APP_OAUTH_TOKEN;
        return;
      }
      if (token) {
        (window as any).__APP_OAUTH_TOKEN = token;
        try {
          window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
        } catch (err) {
          console.warn('[Auth] Unable to persist token to storage:', err);
        }
      } else {
        delete (window as any).__APP_OAUTH_TOKEN;
        try {
          window.localStorage.removeItem(TOKEN_STORAGE_KEY);
        } catch (err) {
          console.warn('[Auth] Unable to remove token from storage:', err);
        }
      }
    }
  };

  const loadAuthConfig = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/config`, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      const data = await res.json();
      const mode = typeof data?.mode === 'string' ? (data.mode as AuthMode) : 'google';
      setAuthMode(mode === 'invite_code' ? 'google' : mode);
    } catch (err) {
      console.warn('[Auth] Unable to load auth config:', err);
    } finally {
      // Signal that we've attempted to load auth config (success or failure)
      setAuthConfigLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadAuthConfig();
  }, [loadAuthConfig]);

  // Accesso incorporato: la sessione arriva da PrevidenzaPro, non dal login.
  useEffect(() => {
    if (!MODALITA_INCORPORATA) return;

    let attivo = true;
    let ponte: Ponte | null = null;
    let rinnovo: number | undefined;
    let attesaPrimoToken: number | undefined;

    // Ascoltiamo da subito: la configurazione arriva dalla rete e nel frattempo
    // la pagina che ci ospita potrebbe gia averci mandato il token.
    const anticipati = raccogliTokenAnticipati();

    const applicaToken = async (tokenPiattaforma: string) => {
      try {
        const esito = await scambiaToken(API_BASE, tokenPiattaforma);
        if (!attivo) return;
        window.clearTimeout(attesaPrimoToken);
        persistToken(esito.token);

        const dati = await fetchMe(esito.token);
        if (!attivo) return;
        setUser(dati);
        userRef.current = dati;
        setEmbedError(dati ? null : 'Accesso riuscito ma profilo non disponibile.');

        // Rinnovo prima della scadenza: chiediamo un token nuovo alla pagina
        const attesa = attesaPrimaDelRinnovo(esito.token);
        if (attesa != null) {
          window.clearTimeout(rinnovo);
          rinnovo = window.setTimeout(() => ponte?.chiediToken(), attesa);
        }
      } catch (err) {
        console.error('[Embed] Scambio del token non riuscito:', err);
        if (attivo) {
          // Puo essere un token raccolto in anticipo e nel frattempo scaduto o
          // gia usato: ci annunciamo di nuovo e ne chiediamo uno valido.
          ponte?.annunciaPronto();
          ponte?.chiediToken();
          setEmbedError("Accesso non riuscito. Ricarica la pagina da PrevidenzaPro.");
        }
      } finally {
        if (attivo) setLoading(false);
      }
    };

    const esci = () => {
      window.clearTimeout(rinnovo);
      setUser(null);
      userRef.current = null;
      persistToken(undefined);
      setLoading(false);
    };

    (async () => {
      try {
        const config = await leggiConfigSSO(API_BASE);
        if (!attivo) return;
        if (!config.enabled || config.parent_origins.length === 0) {
          setEmbedError("L'accesso da PrevidenzaPro non e attivo su questo ambiente.");
          setLoading(false);
          return;
        }

        ponte = creaPonte({
          originiAmmesse: config.parent_origins,
          alToken: (token) => { void applicaToken(token); },
          alLogout: esci,
        });
        ponteRef.current = ponte;

        // Dalla raccolta anticipata al ponte vero, senza buchi.
        anticipati.chiudi();
        const giaArrivato = ponte.riprendi(anticipati.messaggi);

        // Si annuncia e basta: chiedere subito anche un token farebbe emettere
        // due accessi per lo stesso ingresso. Se un token era gia arrivato lo
        // stiamo scambiando, quindi non ne chiediamo un altro. Se dopo qualche
        // secondo non e arrivato nulla, la pagina potrebbe aver finito di
        // caricare prima di noi e non aver sentito l'annuncio: allora lo
        // chiediamo.
        if (!giaArrivato) {
          ponte.annunciaPronto();
          window.setTimeout(() => {
            if (attivo && !userRef.current) ponte?.chiediToken();
          }, 4000);
        }

        attesaPrimoToken = window.setTimeout(() => {
          if (!attivo || userRef.current) return;
          setEmbedError("Nessuna risposta da PrevidenzaPro. Riprova dalla piattaforma.");
          setLoading(false);
        }, 15000);
      } catch (err) {
        console.error('[Embed] Configurazione SSO non leggibile:', err);
        if (attivo) {
          setEmbedError('Servizio di accesso non raggiungibile.');
          setLoading(false);
        }
      }
    })();

    return () => {
      attivo = false;
      window.clearTimeout(rinnovo);
      window.clearTimeout(attesaPrimoToken);
      anticipati.chiudi();
      ponte?.chiudi();
      ponteRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let mounted = true;

    // Listen for popup postMessage (popup flow sends { type: 'oauth', provider, status, token })
    function onMessage(e: MessageEvent) {
      // Log ALL messages for debugging
      console.log('[Auth] 🔔 PostMessage received:', {
        origin: e.origin,
        data: e.data,
        source: e.source === window ? 'self' : 'other window',
        dataType: typeof e.data,
        hasType: e.data?.type,
        hasStatus: e.data?.status
      });
      
      try {
        const payload = e.data;
        
        // First check if this looks like our OAuth message
        if (payload && payload.type === 'oauth' && payload.status === 'success') {
          console.log('[Auth] 🎯 Found OAuth success message!');
          
          // The postMessage comes FROM the backend callback page (which is on API_BASE domain)
          const expectedOrigin = new URL(API_BASE).origin;
          
          // Also accept localhost variant (127.0.0.1 and localhost are treated as same-site but different origins)
          const expectedOriginLocalhost = expectedOrigin.replace('127.0.0.1', 'localhost');
          const expectedOrigin127 = expectedOrigin.replace('localhost', '127.0.0.1');
          
          console.log('[Auth] Expected origins:', expectedOrigin, expectedOriginLocalhost, expectedOrigin127);
          console.log('[Auth] Actual origin:', e.origin);
          
          // Only accept messages from our backend API's origin (with localhost/127.0.0.1 flexibility)
          const isValidOrigin = e.origin === expectedOrigin || 
                               e.origin === expectedOriginLocalhost || 
                               e.origin === expectedOrigin127;
          
          if (!isValidOrigin) {
            console.log('[Auth] ⚠️ Origin mismatch - but processing anyway for debugging!');
            console.log('[Auth] If this works, we need to update the expected origin');
          } else {
            console.log('[Auth] ✅ Origin validated');
          }
          
          console.log('[Auth] 🎉 Processing OAuth success message!');
          // If backend provided a session token in the message, use it for auth
          const token = payload.token as string | undefined;
          if (token) {
            console.log('[Auth] 🔑 Token received in postMessage, length:', token.length);
            persistToken(token);
          } else {
            console.log('[Auth] ⚠️ No token in postMessage payload');
          }
          // Call /auth/me with token (if available) or cookies
          fetchMe(token).then(data => {
            if (data) {
              console.log('[Auth] ✅ User authenticated:', data.email);
              console.log('[Auth] Setting user state and userRef');
              setUser(data);
              userRef.current = data;
              console.log('[Auth] userRef.current is now:', userRef.current?.email);
            } else {
              console.log('[Auth] ❌ /auth/me returned no user data');
            }
          });
        } else {
          console.log('[Auth] ⚠️ Message payload is not an OAuth success message');
        }
      } catch (err) {
        console.error('[Auth] ❌ postMessage handler error:', err);
      }
    }

    window.addEventListener('message', onMessage);

    // Only attempt to call /auth/me after we've loaded auth config. If the configured
    // auth mode is not 'google', skip the automatic /auth/me call to avoid unwanted 401s.
    (async () => {
      if (!authConfigLoaded) return;

      // Incorporati la sessione la porta l'effetto dedicato, dall'inizio alla
      // fine. Se intervenissimo anche da qui faremmo una seconda /auth/me in
      // parallelo alla sua, e al primo intoppo di rete scriveremmo utente
      // assente: l'utente si ritroverebbe davanti il login pubblico.
      if (MODALITA_INCORPORATA) return;

      // For no-auth local mode, check if we have a stored token.
      if (authMode === 'none') {
        // If we have a token, validate it
        if (sessionToken) {
          const u = await fetchMe(sessionToken);
          if (mounted) {
            setUser(u);
            userRef.current = u;
          }
        }
        if (mounted) setLoading(false);
        return;
      }

      // For google mode, always try to fetch user (with token or cookies)
      const u = await fetchMe(sessionToken);
      if (mounted) {
        setUser(u);
        userRef.current = u;
      }
      if (mounted) setLoading(false);
    })();

    return () => {
      mounted = false;
      window.removeEventListener('message', onMessage);
    };
  }, [sessionToken, authConfigLoaded, authMode]);

  const login = async () => {
    if (authMode === 'none') {
      return;
    }

    // Incorporati non apriamo nessun popup: Google blocca le proprie pagine di
    // accesso dentro un iframe, e comunque il diritto di accesso lo decide
    // PrevidenzaPro. Qui possiamo solo richiedere un token nuovo.
    if (MODALITA_INCORPORATA) {
      ponteRef.current?.chiediToken();
      return;
    }

    // For Google OAuth, use backend redirect flow. This is debuggable (we can
    // inspect the exact redirect_uri in the server-built URL) and works with
    // Firebase Hosting preview channels.
    try {
      setLoading(true);
      await new Promise<void>((resolve, reject) => {
        const expected = new URL(API_BASE).origin;
        const expectedLocalhost = expected.replace('127.0.0.1', 'localhost');
        const expected127 = expected.replace('localhost', '127.0.0.1');

        const handler = async (event: MessageEvent) => {
          const data = event.data as { type?: string; provider?: string; status?: string; token?: string } | undefined;
          if (!data || data.type !== 'oauth' || data.provider !== 'google' || data.status !== 'success') return;

          if (event.origin !== expected && event.origin !== expectedLocalhost && event.origin !== expected127) {
            // Ignore unexpected origins
            return;
          }

          window.removeEventListener('message', handler);
          clearTimeout(timeoutId);

          const token = typeof data.token === 'string' ? data.token : undefined;
          if (token) {
            persistToken(token);
          }

          const userData = await fetchMe(token);
          if (!userData) {
            reject(new Error('Login succeeded but failed to load user profile'));
            return;
          }

          setUser(userData);
          userRef.current = userData;
          resolve();
        };

        window.addEventListener('message', handler);
        const timeoutId = window.setTimeout(() => {
          window.removeEventListener('message', handler);
          reject(new Error('Timeout during Google login'));
        }, 60_000);

        const popup = window.open(
          `${API_BASE}/auth/google/login?redirect=${encodeURIComponent(window.location.origin)}`,
          'google_oauth',
          'popup,width=520,height=720'
        );
        if (!popup) {
          window.removeEventListener('message', handler);
          clearTimeout(timeoutId);
          reject(new Error('Popup bloccato dal browser'));
        }
      });
    } catch (err) {
      console.error('[Auth] Google login failed:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Helper to wait for Google GIS library to load
  const waitForGoogleGSI = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (typeof (window as any).google !== 'undefined' && (window as any).google.accounts) {
        resolve();
        return;
      }
      
      let attempts = 0;
      const maxAttempts = 50; // 5 seconds max
      const interval = setInterval(() => {
        attempts++;
        if (typeof (window as any).google !== 'undefined' && (window as any).google.accounts) {
          clearInterval(interval);
          resolve();
        } else if (attempts >= maxAttempts) {
          clearInterval(interval);
          reject(new Error('Google Identity Services library failed to load'));
        }
      }, 100);
    });
  };

  const logout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json',
        },
      });
    } catch (e) {
      // ignore
    }
    setUser(null);
    userRef.current = null;
    persistToken(undefined);
  };

  const refresh = async (tokenOverride?: string) => {
    const effectiveToken = tokenOverride ?? sessionToken;
    const updated = await fetchMe(effectiveToken);
    if (updated) {
      setUser(updated);
      userRef.current = updated;
    }
    if (tokenOverride) {
      persistToken(tokenOverride);
    }
    return updated;
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      logout,
      refresh,
      setToken: persistToken,
      updateUser: (updater) => setUser((prev) => updater(prev)),
      token: sessionToken,
      authMode,
      embedded: MODALITA_INCORPORATA,
      embedError,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export type { AuthUser };
