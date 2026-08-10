import Link from "next/link"
import NewCaseForm from "./NewCaseForm"

export default function NewCasePage() {

  return (
    <main className="min-h-screen bg-gray-50 p-8">

      <div className="mx-auto max-w-2xl">

        <Link
          href="/"
          className="text-sm text-gray-500 hover:text-black"
        >
          ← 返回病例库
        </Link>


        <h1 className="mt-6 text-3xl font-bold">
          新建病例
        </h1>


        <p className="mt-2 text-gray-500">
          创建病例后，再进入病例详情页上传照片。
        </p>


        <div className="
          mt-8
          rounded-xl
          border
          bg-white
          p-6
        ">

          <NewCaseForm />

        </div>

      </div>

    </main>
  )
}