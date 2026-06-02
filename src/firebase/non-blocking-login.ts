import { createClient } from '@/lib/supabase/client';

export const initiateEmailSignIn = async (auth: any, email: string, password: string) => {
    const supabase = createClient();
    await supabase.auth.signInWithPassword({ email, password });
};

export const initiateEmailSignUp = async (auth: any, firestore: any, email: string, password: string, firstName: string, lastName: string, role: string) => {
    const supabase = createClient();
    await supabase.auth.signUp({ email, password, options: { data: { first_name: firstName, last_name: lastName, role } } });
};

export const initiatePasswordReset = async (auth: any, email: string) => {
    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(email);
};
