"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../lib/supabase"

type Props = {
  caseId: string
  caseCode: string
}

export default function DeleteCaseButton({
  caseId,
  caseCode,
}: Props) {
  const router = useRouter()

  const [loading, setLoading] =
    useState(false)

  async function deleteCase() {
    const confirmed = window.confirm(
      `确定要删除病例 ${caseCode} 吗？\n\n病例及其全部照片都会被永久删除。`
    )

    if (!confirmed) {
      return
    }

    setLoading(true)

    try {
      // 1. 查询该病例的全部图片
      const {
        data: images,
        error: imagesError,
      } = await supabase
        .from("case_images")
        .select("image_path")
        .eq("case_id", caseId)

      if (imagesError) {
        throw imagesError
      }

      const imagePaths =
        images
          ?.map((image) => image.image_path)
          .filter(Boolean) ?? []

      // 2. 删除 Storage 文件
      if (imagePaths.length > 0) {
        const {
          error: storageError,
        } = await supabase
          .storage
          .from("case-images")
          .remove(imagePaths)

        if (storageError) {
          throw storageError
        }
      }

      // 3. 删除 case_images 记录
      const {
        error: imageDeleteError,
      } = await supabase
        .from("case_images")
        .delete()
        .eq("case_id", caseId)

      if (imageDeleteError) {
        throw imageDeleteError
      }

      // 4. 删除 cases 记录
      const {
        error: caseDeleteError,
      } = await supabase
        .from("cases")
        .delete()
        .eq("id", caseId)

      if (caseDeleteError) {
        throw caseDeleteError
      }

      // 5. 刷新病例库
      router.refresh()

    } catch (error) {
      console.error(
        "删除病例失败：",
        error
      )

      if (error instanceof Error) {
        alert(
          `删除失败：${error.message}`
        )
      } else {
        alert("删除病例失败")
      }

    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={deleteCase}
      disabled={loading}
      className="
        text-sm
        text-red-500
        hover:text-red-700
        disabled:cursor-not-allowed
        disabled:opacity-50
      "
    >
      {loading
        ? "删除中..."
        : "删除"}
    </button>
  )
}