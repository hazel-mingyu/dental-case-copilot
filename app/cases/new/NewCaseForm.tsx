"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"

export default function NewCaseForm() {
  const router = useRouter()

  const [title, setTitle] = useState("")
  const [loading, setLoading] = useState(false)

  async function createCase() {
    if (loading) {
      return
    }

    setLoading(true)

    const {
      data,
      error,
    } = await supabase.rpc(
      "create_case",
      {
        p_title: title.trim() || null,
      }
    )

    setLoading(false)

    if (error) {
      console.error(
        "创建病例失败：",
        error
      )

      alert(error.message)

      return
    }

    const newCase = data?.[0]

    if (!newCase) {
      alert("病例创建失败：未返回病例数据")
      return
    }

    router.push(
      `/cases/${newCase.id}`
    )

    router.refresh()
  }

  return (
    <div className="space-y-6">

      <div>
        <label
          className="
            block
            text-sm
            font-medium
          "
        >
          病例标题
        </label>

        <input
          type="text"
          value={title}
          onChange={(e) =>
            setTitle(e.target.value)
          }
          placeholder="例如：前牙美学修复"
          className="
            mt-2
            w-full
            rounded-lg
            border
            px-3
            py-2
            outline-none
            focus:ring-2
            focus:ring-black
          "
        />
      </div>

      <button
        type="button"
        onClick={createCase}
        disabled={loading}
        className="
          rounded-lg
          bg-black
          px-4
          py-2
          text-white
          hover:bg-gray-800
          disabled:cursor-not-allowed
          disabled:opacity-50
        "
      >
        {loading
          ? "创建中..."
          : "创建病例"}
      </button>

    </div>
  )
}