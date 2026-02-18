
'use client';
import {
  Auth,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, Firestore } from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';

/** Initiate anonymous sign-in (non-blocking). */
export function initiateAnonymousSignIn(authInstance: Auth): void {
  signInAnonymously(authInstance).catch((error) => {
    console.error("Anonymous sign-in error:", error);
    toast({
        variant: "destructive",
        title: "Login Failed",
        description: "Could not sign in anonymously. Please try again later.",
    });
  });
}

/** Initiate email/password sign-up (non-blocking). */
export function initiateEmailSignUp(
  authInstance: Auth, 
  db: Firestore,
  email: string, 
  password: string, 
  firstName: string, 
  lastName: string,
  role: string = 'Sales'
): void {
  createUserWithEmailAndPassword(authInstance, email, password)
    .then(async (userCredential) => {
      const user = userCredential.user;
      
      // 1. Update auth profile
      await updateProfile(user, {
        displayName: `${firstName} ${lastName}`
      });

      // 2. Create Firestore user profile immediately
      // This ensures the user list is populated and roles are assigned without waiting for the background trigger
      const userDocRef = doc(db, 'users', user.uid);
      return setDoc(userDocRef, {
        id: user.uid,
        firstName,
        lastName,
        email: user.email,
        roles: [role],
      });
    })
    .catch((error) => {
    if (error.code === 'auth/email-already-in-use') {
        toast({
            variant: "destructive",
            title: "Sign Up Failed",
            description: "An account with this email address already exists.",
        });
    } else {
        console.error("Sign-up error:", error);
        toast({
            variant: "destructive",
            title: "Sign Up Failed",
            description: error.message,
        });
    }
  });
}

/** Initiate email/password sign-in (non-blocking). */
export function initiateEmailSignIn(authInstance: Auth, email: string, password: string): void {
  signInWithEmailAndPassword(authInstance, email, password)
    .catch((error) => {
        if (error.code === 'auth/invalid-credential') {
            toast({
                variant: "destructive",
                title: "Login Failed",
                description: "Incorrect email or password. Please try again.",
            });
        } else {
            console.error("Sign-in error:", error);
            toast({
                variant: "destructive",
                title: "Login Failed",
                description: "An unexpected error occurred. Please try again.",
            });
        }
    });
}

/** Initiate password reset email (non-blocking). */
export function initiatePasswordReset(authInstance: Auth, email: string): void {
  sendPasswordResetEmail(authInstance, email)
    .then(() => {
      toast({
        title: 'Password Reset Email Sent',
        description: `If an account exists for ${email}, a password reset link has been sent.`,
      });
    })
    .catch((error) => {
      // Don't reveal if the user exists for security reasons. Log the actual error for debugging.
      console.error('Password reset error:', error);
      // Show a generic message to the user.
      toast({
        title: 'Password Reset Email Sent',
        description: `If an account exists for ${email}, a password reset link has been sent.`,
      });
    });
}
