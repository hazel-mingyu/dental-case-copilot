"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"

type Props = {
  caseId: string
  initialTitle: string | null
}

export default function EditCaseTitle({
  caseId,
  initialTitle,
}: Props) {
  const router = useRouter()

  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(initialTitle ?? "")
  const [loading, setLoading] = useState(false)

  async function saveTitle() {
    setLoading(true)

    const { error } = await supabase
      .from("cases")
      .update({
        title: title.trim() || null,
      })
      .eq("id", caseId)

    setLoading(false)

    if (error) {
      alert(error.message)
      return
    }

    setEditing(false)

    router.refresh()
  }

  function cancelEdit() {
    setTitle(initialTitle ?? "")
    setEditing(false)
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-3">
        <p className="text-lg">
          {initialTitle || "未命名病例"}
        </p>

        <button
          type="button"
          onClick={() => setEditing(true)}
          className="
            text-sm
            text-gray-500
            hover:text-black
          "
        >
          编辑
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="输入病例标题"
        className="
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

      <div className="flex gap-2">
        <button
          type="button"
          onClick={saveTitle}
          disabled={loading}
          className="
            rounded-lg
            bg-black
            px-4
            py-2
            text-sm
            text-white
            disabled:opacity-50
          "
        >
          {loading ? "保存中..." : "保存"}
        </button>

        <button
          type="button"
          onClick={cancelEdit}
          disabled={loading}
          className="
            rounded-lg
            border
            px-4
            py-2
            text-sm
          "
        >
          取消
        </button>
      </div>
    </div>
  )
}