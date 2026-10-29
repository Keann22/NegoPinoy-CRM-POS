import { createClient as createSessionClient } from '@/lib/supabase/server';
import { editorFromUser } from '@/lib/services/receipt-correction-service';

/** The signed-in user for an API route, or null. Taken from the session, never the body. */
export async function getRequestEditor() {
  const sessionClient = await createSessionClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  return editorFromUser(user);
}
