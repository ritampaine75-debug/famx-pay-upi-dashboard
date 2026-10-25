import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, firestoreDb } from '../lib/firebase';
import {
  apiRequest,
  createDevJwtToken,
  getStoredDevSession,
  setStoredDevSession,
} from '../lib/api';
import type {
  GmailMonitoringState,
  SellerLiveStats,
  SellerPaymentSettings,
  UserProfile,
} from '../types/domain';

interface SellerMeResponse {
  profile: UserProfile;
  settings: SellerPaymentSettings;
  gmail: GmailMonitoringState;
  stats: SellerLiveStats;
}

interface AuthContextValue {
  firebaseUser: User | null;
  isAuthenticated: boolean;
  authMode: 'firebase' | 'dev_fallback' | 'none';
  loading: boolean;
  profile: UserProfile | null;
  settings: SellerPaymentSettings | null;
  gmailState: GmailMonitoringState | null;
  stats: SellerLiveStats | null;
  authError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  registerSeller: (name: string, email: string, password: string) => Promise<void>;
  signInWithDevFallback: (email: string, name?: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSellerData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<'firebase' | 'dev_fallback' | 'none'>('none');
  const [loading, setLoading] = useState<boolean>(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<SellerPaymentSettings | null>(null);
  const [gmailState, setGmailState] = useState<GmailMonitoringState | null>(null);
  const [stats, setStats] = useState<SellerLiveStats | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const refreshSellerData = useCallback(async () => {
    try {
      const data = await apiRequest<SellerMeResponse>('/api/me');
      setProfile(data.profile);
      setSettings(data.settings);
      setGmailState(data.gmail);
      setStats(data.stats);
      setAuthError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load seller profile';
      setAuthError(msg);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setFirebaseUser(user);
        setAuthMode('firebase');
        setStoredDevSession(null);
        await refreshSellerData();
        setLoading(false);
      } else {
        setFirebaseUser(null);
        const devSession = getStoredDevSession();
        if (devSession) {
          setAuthMode('dev_fallback');
          await refreshSellerData();
        } else {
          setAuthMode('none');
          setProfile(null);
          setSettings(null);
          setGmailState(null);
          setStats(null);
        }
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [refreshSellerData]);

  const signIn = async (email: string, password: string) => {
    setAuthError(null);
    await signInWithEmailAndPassword(auth, email.trim(), password);
    await refreshSellerData();
  };

  const registerSeller = async (name: string, email: string, password: string) => {
    setAuthError(null);
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    if (name.trim()) {
      await updateProfile(cred.user, { displayName: name.trim() });
    }
    // Attempt non-privileged Firestore user doc creation if Firestore rules allow
    try {
      const userDocRef = doc(firestoreDb, 'users', cred.user.uid);
      const snap = await getDoc(userDocRef);
      if (!snap.exists()) {
        await setDoc(userDocRef, {
          uid: cred.user.uid,
          displayName: name.trim(),
          email: email.trim().toLowerCase(),
          role: 'seller',
          accountStatus: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    } catch {
      // Backend /api/me is canonical and provisions profile server-side
    }
    await refreshSellerData();
  };

  const signInWithDevFallback = async (email: string, name?: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const displayName = (name || cleanEmail.split('@')[0] || 'Merchant').trim();
    const uid = `seller_${cleanEmail.replace(/[^a-z0-9]/g, '_').slice(0, 24)}`;
    const token = createDevJwtToken(uid, cleanEmail, displayName);
    setStoredDevSession({ uid, email: cleanEmail, displayName, token });
    setAuthMode('dev_fallback');
    await refreshSellerData();
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  };

  const signOut = async () => {
    setStoredDevSession(null);
    if (auth.currentUser) {
      await firebaseSignOut(auth);
    }
    setFirebaseUser(null);
    setAuthMode('none');
    setProfile(null);
    setSettings(null);
    setGmailState(null);
    setStats(null);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        isAuthenticated: authMode !== 'none' && Boolean(profile),
        authMode,
        loading,
        profile,
        settings,
        gmailState,
        stats,
        authError,
        signIn,
        registerSeller,
        signInWithDevFallback,
        resetPassword,
        signOut,
        refreshSellerData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return ctx;
}
