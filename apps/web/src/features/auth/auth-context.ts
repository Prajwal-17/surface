import { createContext, useContext } from "react";

export interface AuthSession {
  authenticated: boolean;
  email?: string;
}

export interface AuthContextValue {
  email: string;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside the authenticated app.");
  }
  return value;
}
