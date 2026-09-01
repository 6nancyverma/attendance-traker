"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { UserPayload } from "@/types/api";

interface AuthState {
  token: string | null;
  user: UserPayload | null;
}

interface AuthContextValue extends AuthState {
  /** True once the initial localStorage read has completed on the client. */
  hydrated: boolean;
  isAuthenticated: boolean;
  login: (token: string, user: UserPayload) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ token: null, user: null });
  const [hydrated, setHydrated] = useState(false);

  // Read persisted auth after mount so server and first client render match.
  useEffect(() => {
    try {
      const token = localStorage.getItem("token");
      const userRaw = localStorage.getItem("user");
      setState({
        token,
        user: userRaw ? (JSON.parse(userRaw) as UserPayload) : null,
      });
    } catch {
      // ignore malformed storage
    }
    setHydrated(true);
  }, []);

  const login = useCallback((token: string, user: UserPayload) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    setState({ token, user });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setState({ token: null, user: null });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        hydrated,
        isAuthenticated: !!state.token,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
