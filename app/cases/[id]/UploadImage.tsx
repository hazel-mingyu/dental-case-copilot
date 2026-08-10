"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"

type Props = {
  caseId: string
}

export default function UploadImage({
  caseId,
}: Props) {
  const router = useRouter()

  const inputRef =
    useRef<HTMLInputElement>(null)

  const [loading, setLoading] =
    useState(false)

  const [progress, setProgress] =
    useState("")

  function openFilePicker() {
    inputRef.current?.click()
  }

  async function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const files = Array.from(
      event.target.files ?? []
    )

    if (files.length === 0) {
      return
    }

    setLoading(true)

    const failedFiles: string[] = []

    try {
      for (
        let index = 0;
        index < files.length;
        index++
      ) {
        const file = files[index]

        setProgress(
          `正在上传 ${index + 1} / ${files.length}`
        )

        const safeFileName =
          file.name.replace(/\s+/g, "-")

        const imagePath =
          `${caseId}/${Date.now()}-${index}-${safeFileName}`

        // 1. 上传到 Storage
        const {
          error: uploadError,
        } = await supabase
          .storage
          .from("case-images")
          .upload(
            imagePath,
            file
          )

        if (uploadError) {
          console.error(
            `Storage 上传失败：${file.name}`,
            uploadError
          )

          failedFiles.push(file.name)

          continue
        }

        // 2. 写入 case_images
        const {
          error: insertError,
        } = await supabase
          .from("case_images")
          .insert({
            case_id: caseId,
            image_path: imagePath,
          })

        if (insertError) {
          console.error(
            `数据库写入失败：${file.name}`,
            insertError
          )

          // 数据库失败时清理 Storage
          await supabase
            .storage
            .from("case-images")
            .remove([imagePath])

          failedFiles.push(file.name)
        }
      }

      // 所有文件完成后只刷新一次
      router.refresh()

      if (failedFiles.length > 0) {
        alert(
          `部分图片上传失败：\n${failedFiles.join("\n")}`
        )
      }

    } catch (error) {
      console.error(
        "批量上传失败：",
        error
      )

      alert("图片上传过程中发生错误")

    } finally {
      setLoading(false)
      setProgress("")

      if (inputRef.current) {
        inputRef.current.value = ""
      }
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      <button
        type="button"
        onClick={openFilePicker}
        disabled={loading}
        className="
          rounded-lg
          bg-black
          px-4
          py-2
          text-sm
          font-medium
          text-white
          hover:bg-gray-800
          disabled:cursor-not-allowed
          disabled:opacity-50
        "
      >
        {loading
          ? progress || "上传中..."
          : "上传图片"}
      </button>
    </div>
  )
}