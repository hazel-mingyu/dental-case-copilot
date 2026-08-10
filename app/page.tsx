import Link from "next/link"
import { supabase } from "../lib/supabase"
import DeleteCaseButton from "./DeleteCaseButton"

export const dynamic = "force-dynamic"

export default async function Home() {
  const {
    data: cases,
    error,
  } = await supabase
    .from("cases")
    .select("id,case_code,title,created_at")
    .order("created_at", {
      ascending: false,
    })

  if (error) {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-bold">
          病例加载失败
        </h1>

        <p className="mt-3 text-gray-500">
          {error.message}
        </p>
      </main>
    )
  }

  return (
    <main className="p-8">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">
          我的病例库
        </h1>

        <Link
          href="/cases/new"
          className="
            rounded-lg
            bg-black
            px-4
            py-2
            text-sm
            font-medium
            text-white
            hover:bg-gray-800
          "
        >
          + 新建病例
        </Link>
      </div>

      {/* 空病例库 */}
      {cases?.length === 0 ? (
        <div
          className="
            mt-8
            rounded-xl
            border
            border-dashed
            bg-gray-50
            px-6
            py-12
            text-center
          "
        >
          <p className="font-medium text-gray-700">
            暂无病例
          </p>

          <p className="mt-2 text-sm text-gray-500">
            创建第一个病例后，会显示在这里。
          </p>

          <Link
            href="/cases/new"
            className="
              mt-5
              inline-block
              rounded-lg
              bg-black
              px-4
              py-2
              text-sm
              font-medium
              text-white
              hover:bg-gray-800
            "
          >
            新建病例
          </Link>
        </div>
      ) : (
        /* 病例列表 */
        <div
          className="
            mt-8
            grid
            gap-4
            sm:grid-cols-2
            lg:grid-cols-3
          "
        >
          {cases?.map((caseItem) => (
            <div
              key={caseItem.id}
              className="
                flex
                flex-col
                rounded-xl
                border
                bg-white
                transition
                hover:shadow-md
              "
            >
              {/* 点击主体进入详情 */}
              <Link
                href={`/cases/${caseItem.id}`}
                className="
                  flex-1
                  p-6
                "
              >
                <p
                  className="
                    text-sm
                    font-medium
                    text-gray-500
                  "
                >
                  {caseItem.case_code}
                </p>

                <h2
                  className="
                    mt-2
                    text-lg
                    font-semibold
                  "
                >
                  {caseItem.title || "未命名病例"}
                </h2>

                <p
                  className="
                    mt-4
                    text-sm
                    text-gray-400
                  "
                >
                  创建时间：
                  {new Date(
                    caseItem.created_at
                  ).toLocaleString("zh-CN")}
                </p>
              </Link>

              {/* Card 底部操作区 */}
              <div
                className="
                  flex
                  justify-end
                  border-t
                  px-6
                  py-3
                "
              >
                <DeleteCaseButton
                  caseId={caseItem.id}
                  caseCode={caseItem.case_code}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}