import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, setAccessToken, getAccessToken } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Attempt silent session restoration on mount via HttpOnly refresh cookie
  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      try {
        const res = await api.refreshToken();
        if (isMounted && res?.data?.accessToken) {
          setAccessToken(res.data.accessToken);
          setUser(res.data.user);
        }
      } catch {
        // No active refresh session; visitor remains unauthenticated
        if (isMounted) {
          setAccessToken(null);
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();
    return () => {
      isMounted = false;
    };
  }, []);

  const login = useCallback(async ({ email, password }) => {
    setAuthError(null);
    try {
      const res = await api.login({ email, password });
      const { user: loggedInUser, accessToken } = res.data || {};
      setAccessToken(accessToken);
      setUser(loggedInUser);
      return res.data;
    } catch (err) {
      setAuthError(err.message || 'Login failed');
      throw err;
    }
  }, []);

  const register = useCallback(async ({ fullName, email, password, phone }) => {
    setAuthError(null);
    try {
      const res = await api.register({ fullName, email, password, phone });
      const { user: registeredUser, accessToken } = res.data || {};
      setAccessToken(accessToken);
      setUser(registeredUser);
      return res.data;
    } catch (err) {
      setAuthError(err.message || 'Registration failed');
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch (err) {
      console.warn('Logout API error:', err);
    } finally {
      setAccessToken(null);
      setUser(null);
      setAuthError(null);
    }
  }, []);

  const logoutAll = useCallback(async () => {
    try {
      await api.logoutAll(user?.id);
    } catch (err) {
      console.warn('Logout-all API error:', err);
    } finally {
      setAccessToken(null);
      setUser(null);
      setAuthError(null);
    }
  }, [user?.id]);

  const changePassword = useCallback(async ({ currentPassword, newPassword }) => {
    setAuthError(null);
    try {
      const res = await api.changePassword({ currentPassword, newPassword }, user?.id);
      // All existing sessions invalidated upon password change
      setAccessToken(null);
      setUser(null);
      return res;
    } catch (err) {
      setAuthError(err.message || 'Password change failed');
      throw err;
    }
  }, [user?.id]);

  const updateProfile = useCallback(async (profileData) => {
    try {
      const res = await api.updateProfile(profileData, user?.id);
      if (res?.data) {
        setUser((prev) => ({ ...prev, ...res.data }));
      }
      return res.data;
    } catch (err) {
      setAuthError(err.message || 'Profile update failed');
      throw err;
    }
  }, [user?.id]);

  const value = {
    user,
    accessToken: getAccessToken(),
    isAuthenticated: !!user,
    isLoading,
    authError,
    login,
    register,
    logout,
    logoutAll,
    changePassword,
    updateProfile,
    setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
