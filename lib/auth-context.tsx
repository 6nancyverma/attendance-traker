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
  /** Profile photo as a data URL, or null to show initials. */
  avatar: string | null;
  /** Update the cached photo after an upload or removal. */
  setAvatar: (avatar: string | null) => void;
  login: (token: string, user: UserPayload) => void;
  logout: () => void;
}

const AVATAR_KEY = "avatar";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ token: null, user: null });
  const [hydrated, setHydrated] = useState(false);
  const [avatar, setAvatarState] = useState<string | null>(null);

  // Read persisted auth after mount so server and first client render match.
  useEffect(() => {
    try {
      const token = localStorage.getItem("token");
      const userRaw = localStorage.getItem("user");
      setState({
        token,
        user: userRaw ? (JSON.parse(userRaw) as UserPayload) : null,
      });
      setAvatarState(localStorage.getItem(AVATAR_KEY));
    } catch {
      // ignore malformed storage
    }
    setHydrated(true);
  }, []);

  const setAvatar = useCallback((value: string | null) => {
    setAvatarState(value);
    try {
      if (value) localStorage.setItem(AVATAR_KEY, value);
      else localStorage.removeItem(AVATAR_KEY);
    } catch {
      // Storage full or blocked: the photo still shows for this session.
    }
  }, []);

  // The photo is too big for the JWT, so fetch it once per session. The
  // localStorage copy shows instantly meanwhile.
  useEffect(() => {
    if (!state.token) return;
    let cancelled = false;
    fetch("/api/settings/avatar", {
      headers: { Authorization: `Bearer ${state.token}` },
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { avatar?: string | null } | null) => {
        if (!cancelled && data) setAvatar(data.avatar ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [state.token, setAvatar]);

  const login = useCallback((token: string, user: UserPayload) => {
    // A different account must not inherit the previous one's photo.
    try {
      const previous = JSON.parse(localStorage.getItem("user") || "null");
      if (previous?._id !== user._id) {
        localStorage.removeItem(AVATAR_KEY);
        setAvatarState(null);
      }
    } catch {
      localStorage.removeItem(AVATAR_KEY);
      setAvatarState(null);
    }
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    setState({ token, user });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem(AVATAR_KEY);
    setAvatarState(null);
    setState({ token: null, user: null });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        hydrated,
        isAuthenticated: !!state.token,
        avatar,
        setAvatar,
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
