"use client"

import { type FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"

export default function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [resetMode, setResetMode] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setMessage("")
    setLoading(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (signInError) {
      setError("邮箱或密码错误，请重试。")
      setLoading(false)
      return
    }
    router.replace("/")
    router.refresh()
  }

  async function sendResetEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setMessage("")
    setLoading(true)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/update-password`,
    })
    if (resetError) {
      setError("重置邮件发送失败，请稍后重试。")
      setLoading(false)
      return
    }
    setMessage("如果该邮箱已注册，重置邮件已发送，请查收邮箱。")
    setLoading(false)
  }

  function showLogin() {
    setResetMode(false)
    setError("")
    setMessage("")
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#f9faf9] px-4 py-8">
    <form onSubmit={resetMode ? sendResetEmail : submit} className="w-full max-w-sm rounded-xl border border-[#dbe3de] bg-white p-6 shadow-sm">
      <p className="text-sm text-[#597369]">DentCase</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#212e29]">{resetMode ? "设置/找回密码" : "登录病例库"}</h1>
      {resetMode && <p className="mt-2 text-sm text-[#597369]">输入账号邮箱，我们将发送设置新密码的链接。</p>}
      <label className="mt-6 block text-sm font-medium text-[#303b36]">邮箱
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" className="mt-1.5 w-full rounded-lg border border-[#dbe3de] px-3 py-2.5 text-sm outline-none focus:border-[#126e47] focus:ring-2 focus:ring-[#dceee5]" />
      </label>
      {!resetMode && <label className="mt-4 block text-sm font-medium text-[#303b36]">密码
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" className="mt-1.5 w-full rounded-lg border border-[#dbe3de] px-3 py-2.5 text-sm outline-none focus:border-[#126e47] focus:ring-2 focus:ring-[#dceee5]" />
      </label>}
      {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
      {message && <p role="status" className="mt-4 text-sm text-[#126e47]">{message}</p>}
      <button type="submit" disabled={loading} className="mt-6 w-full rounded-lg bg-[#126e47] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#0f5d3c] disabled:cursor-not-allowed disabled:opacity-60">{loading ? "处理中…" : resetMode ? "发送重置邮件" : "登录"}</button>
      {resetMode ? <button type="button" onClick={showLogin} className="mt-4 text-sm text-[#597369] transition hover:text-[#126e47]">返回登录</button> : <button type="button" onClick={() => { setResetMode(true); setError(""); setMessage("") }} className="mt-4 text-sm text-[#597369] transition hover:text-[#126e47]">设置/找回密码</button>}
    </form>
  </main>
}
