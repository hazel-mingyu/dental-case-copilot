import Link from "next/link"
import { supabase } from "../../../lib/supabase"
import UploadImage from "./UploadImage"
import ImageGallery from "./ImageGallery"
import EditCaseTitle from "./EditCaseTitle"

export const dynamic = "force-dynamic"

export default async function CaseDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // 获取病例信息
  const {
    data: caseData,
    error,
  } = await supabase
    .from("cases")
    .select("*")
    .eq("id", id)
    .single()

  if (error || !caseData) {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-bold">
          加载失败
        </h1>

        <p className="mt-3 text-gray-500">
          {error?.message}
        </p>

        <Link
          href="/"
          className="
            mt-6
            inline-block
            text-sm
            text-gray-500
            hover:text-black
          "
        >
          ← 返回病例库
        </Link>
      </main>
    )
  }

  // 获取病例图片
  const {
    data: images,
  } = await supabase
    .from("case_images")
    .select("id,image_path")
    .eq("case_id", id)

  const imageList =
    images?.map((img) => {
      const { data } = supabase
        .storage
        .from("case-images")
        .getPublicUrl(
          img.image_path
        )

      return {
        id: img.id,
        image_path: img.image_path,
        url: data.publicUrl,
      }
    }) ?? []

  return (
    <main className="p-8">

      {/* 返回病例库 */}
      <Link
        href="/"
        className="
          text-sm
          text-gray-500
          hover:text-black
        "
      >
        ← 返回病例库
      </Link>

      {/* 病例编号 */}
      <h1
        className="
          mt-6
          text-3xl
          font-bold
        "
      >
        {caseData.case_code}
      </h1>

      {/* 病例基本信息 */}
      <div
        className="
          mt-6
          rounded-xl
          border
          bg-white
          p-6
        "
      >
        <EditCaseTitle
          caseId={caseData.id}
          initialTitle={caseData.title}
        />

        <p
          className="
            mt-3
            text-sm
            text-gray-500
          "
        >
          创建时间：
          {new Date(
            caseData.created_at
          ).toLocaleString("zh-CN")}
        </p>
      </div>

      {/* 病例照片 */}
      <div className="mt-8">
        <h2
          className="
            text-xl
            font-semibold
          "
        >
          病例照片
        </h2>

        <div className="mt-4">

          {imageList.length === 0 ? (

            /* Empty State */
            <div
              className="
                rounded-xl
                border
                border-dashed
                bg-gray-50
                px-6
                py-12
                text-center
              "
            >
              <p
                className="
                  font-medium
                  text-gray-700
                "
              >
                暂无病例照片
              </p>

              <p
                className="
                  mt-2
                  text-sm
                  text-gray-500
                "
              >
                上传该病例的口腔照片，
                照片会显示在这里。
              </p>
            </div>

          ) : (

            <ImageGallery
              images={imageList}
            />

          )}

        </div>
      </div>

      {/* 上传图片 */}
      <div className="mt-8">
        <UploadImage
          caseId={id}
        />
      </div>

    </main>
  )
}