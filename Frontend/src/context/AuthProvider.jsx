import { useCallback, useMemo, useState } from 'react';
import { AuthContext } from './contexts.js';
import { api } from '../api/index.js';

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(() => api.auth.session());

  const login = useCallback(async (email, password) => {
    const u = await api.auth.login(email, password);
    setUser(u);
    return u;
  }, []);
  const signup = useCallback(async (name, email, password) => {
    const u = await api.auth.signup(name, email, password);
    setUser(u);
    return u;
  }, []);
  const logout = useCallback(async () => {
    await api.auth.logout();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, login, signup, logout, authRequired: api.authRequired }), [user, login, signup, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
