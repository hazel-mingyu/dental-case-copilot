import "server-only"

import { createServerSupabaseClient } from "./supabase"

export async function getCurrentUser() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return user
}
