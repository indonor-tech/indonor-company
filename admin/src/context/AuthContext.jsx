import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, getAccessToken, setAccessToken } from '../services/api';

const AuthContext = createContext(null);

function isMutatingPermission(permission = '') {
  return permission.includes(':write')
    || permission.includes(':create')
    || permission.includes(':update')
    || permission.includes(':delete')
    || permission.includes(':assign')
    || permission.includes(':convert')
    || permission.includes(':manage')
    || permission.includes('finance')
    || permission.includes(':upload');
}

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
  const value = useMemo(() => {
    const isViewAdmin = user?.role === 'VIEW_ADMIN';
    return {
      user,
      loading,
      login: async (credentials) => {
        const { data } = await api.post('/auth/login', credentials);
        setAccessToken(data.data.accessToken);
        setUser(data.data.user);
      },
      logout: async () => { try { await api.post('/auth/logout'); } finally { setAccessToken(null); setUser(null); } },
      is: (...roles) => roles.includes(user?.role),
      isViewAdmin,
      can: (permission) => {
        if (!user) return false;
        if (user.role === 'SUPER_ADMIN' || user.permissions?.includes('*')) return true;
        if (isViewAdmin && isMutatingPermission(permission)) return false;
        return Boolean(user.permissions?.includes(permission));
      },
      canWrite: (permission) => {
        if (!user || isViewAdmin) return false;
        return Boolean(user.role === 'SUPER_ADMIN' || user.permissions?.includes('*') || user.permissions?.includes(permission));
      }
    };
  }, [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
