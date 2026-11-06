import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api, { TOKEN_KEY } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me/')
      .then((r) => setUser(r.data))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username, password) => {
    const { data } = await api.post('/auth/login/', { username, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout/');
    } catch {
      /* ignore */
    }
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);

  return <AuthContext.Provider value={{ user, loading, login, logout, setToken }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
