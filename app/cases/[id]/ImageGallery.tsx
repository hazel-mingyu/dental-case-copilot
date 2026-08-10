"use client"

import { supabase } from "../../../lib/supabase"
import { useRouter } from "next/navigation"


export default function ImageGallery({
  images
}:{
  images:{
    id:string
    image_path:string
    url:string
  }[]
}) {


  const router = useRouter()



  async function deleteImage(
    id:string,
    path:string
  ){

    const confirmDelete =
      window.confirm(
        "确定删除这张照片吗？"
      )


    if(!confirmDelete){
      return
    }



    const {
      error:storageError
    } = await supabase
      .storage
      .from("case-images")
      .remove([
        path
      ])


    if(storageError){
      alert(storageError.message)
      return
    }



    const {
      error:dbError
    } = await supabase
      .from("case_images")
      .delete()
      .eq(
        "id",
        id
      )


    if(dbError){
      alert(dbError.message)
      return
    }



    router.refresh()

  }



  return (

    <div
      className="
        mt-4
        grid
        grid-cols-3
        gap-4
      "
    >

      {
        images.map((img)=>(

          <div
            key={img.id}
            className="
              relative
              rounded-xl
              border
              overflow-hidden
            "
          >

            <img
              src={img.url}
              alt="病例照片"
              className="
                h-48
                w-full
                object-cover
              "
            />


            <button
              onClick={() =>
                deleteImage(
                  img.id,
                  img.image_path
                )
              }
              className="
                absolute
                right-2
                top-2
                rounded-lg
                bg-red-600
                px-3
                py-1
                text-white
              "
            >
              删除
            </button>


          </div>

        ))
      }


    </div>

  )

}