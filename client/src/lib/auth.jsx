import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

// Backend user -> what the UI needs. Only safe fields; never tokens or passwords.
function toUiUser(u) {
  if (!u) return null;
  const fallbackName = u.role === 'COORDINATOR' ? 'Coordinator' : u.email.split('@')[0];
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    name: u.student?.name ?? fallbackName,
    studentId: u.student?.id ?? null,
    student: u.student ?? null,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { id, name, email, role, studentId }
  const [loading, setLoading] = useState(true);

  // The server session is the source of truth: ask it who we are on startup.
  const refreshUser = () =>
    api.get('/auth/me').then((u) => setUser(toUiUser(u))).catch(() => setUser(null));

  useEffect(() => {
    api.onUnauthorized(() => setUser(null)); // session expired -> back to login
    refreshUser().finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const data = await api.post('/auth/login', { email, password });
    api.setCsrfToken(data.csrfToken); // token rotates on login
    const u = toUiUser(data);
    setUser(u);
    return u;
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } finally {
      api.resetCsrf();
      setUser(null);
    }
  };

  return (
    <AuthCtx.Provider value={{ user, loading, isAuthenticated: !!user, login, logout, refreshUser }}>
      {children}
    </AuthCtx.Provider>
  );
}
