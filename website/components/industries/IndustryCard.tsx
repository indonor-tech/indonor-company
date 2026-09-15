import Image from "next/image"

interface Props {
  title: string
  image: string
}

export default function IndustryCard({ title, image }: Props) {
  return (
    <div className="group relative overflow-hidden rounded-2xl">

      <Image
        src={image}
        alt={title}
        width={500}
        height={350}
        className="object-cover w-full h-[260px] group-hover:scale-110 transition duration-500"
      />

      <div className="absolute inset-0 bg-black/50 group-hover:bg-black/60 transition" />

      <h3 className="absolute bottom-6 left-6 text-white text-2xl font-semibold">
        {title}
      </h3>

    </div>
  )
}