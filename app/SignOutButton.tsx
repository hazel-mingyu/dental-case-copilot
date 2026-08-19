"use client"

import { useRouter } from "next/navigation"
import { supabase } from "../lib/supabase"

export default function SignOutButton() {
  const router = useRouter()

  async function signOut() {
    await supabase.auth.signOut()
    router.replace("/login")
    router.refresh()
  }

  return <button type="button" onClick={signOut} className="text-sm text-[#597369] transition hover:text-[#126e47]">退出登录</button>
}
