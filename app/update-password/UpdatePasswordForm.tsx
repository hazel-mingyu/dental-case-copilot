"use client"

import { type FormEvent, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"

export default function UpdatePasswordForm() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [ready, setReady] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (active) setReady(Boolean(session))
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (active && (event === "PASSWORD_RECOVERY" || event === "INITIAL_SESSION")) {
        setReady(Boolean(session))
      }
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    if (password !== confirmation) {
      setError("两次输入的密码不一致。")
      return
    }
    if (!ready) {
      setError("恢复链接无效或已过期，请重新发送恢复邮件。")
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError("密码设置失败，请重新打开恢复链接后重试。")
      setLoading(false)
      return
    }

    setSuccess(true)
    window.setTimeout(() => {
      void supabase.auth.signOut().finally(() => {
        router.replace("/login")
        router.refresh()
      })
    }, 900)
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#f9faf9] px-4 py-8">
    <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-[#dbe3de] bg-white p-6 shadow-sm">
      <p className="text-sm text-[#597369]">DentCase</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#212e29]">设置新密码</h1>
      <p className="mt-2 text-sm text-[#597369]">请为账号设置新的登录密码。</p>
      <label className="mt-6 block text-sm font-medium text-[#303b36]">新密码
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="new-password" className="mt-1.5 w-full rounded-lg border border-[#dbe3de] px-3 py-2.5 text-sm outline-none focus:border-[#126e47] focus:ring-2 focus:ring-[#dceee5]" />
      </label>
      <label className="mt-4 block text-sm font-medium text-[#303b36]">确认新密码
        <input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required autoComplete="new-password" className="mt-1.5 w-full rounded-lg border border-[#dbe3de] px-3 py-2.5 text-sm outline-none focus:border-[#126e47] focus:ring-2 focus:ring-[#dceee5]" />
      </label>
      {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
      {success && <p role="status" className="mt-4 text-sm text-[#126e47]">密码设置成功，正在返回登录页…</p>}
      <button type="submit" disabled={loading || success} className="mt-6 w-full rounded-lg bg-[#126e47] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#0f5d3c] disabled:cursor-not-allowed disabled:opacity-60">{loading ? "设置中…" : "设置新密码"}</button>
    </form>
  </main>
}
