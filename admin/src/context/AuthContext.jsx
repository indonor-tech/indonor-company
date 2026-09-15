import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, getAccessToken, setAccessToken } from '../services/api';

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      try {
        if (!getAccessToken()) {
          setLoading(false);
          return;
        }
        const { data } = await api.get('/auth/me');
        if (!cancelled) setUser(data.data);
      } catch {
        setAccessToken(null);
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    restore();
    return () => { cancelled = true; };
  }, []);
  const value = useMemo(() => ({
    user, loading,
    login: async (credentials) => {
      const { data } = await api.post('/auth/login', credentials);
      setAccessToken(data.data.accessToken);
      setUser(data.data.user);
    },
    logout: async () => { try { await api.post('/auth/logout'); } finally { setAccessToken(null); setUser(null); } },
    is: (...roles) => roles.includes(user?.role),
    can: (permission) => Boolean(user && (user.role === 'SUPER_ADMIN' || user.permissions?.includes('*') || user.permissions?.includes(permission)))
  }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
