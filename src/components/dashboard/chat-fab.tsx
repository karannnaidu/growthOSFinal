import Link from 'next/link'
import { MessageCircle } from 'lucide-react'

export function ChatFAB() {
  return (
    <Link
      href="/dashboard/chat"
      aria-label="Open chat with Mia"
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center
        rounded-full bg-[#6366f1] text-white shadow-lg shadow-[#6366f1]/30
        hover:bg-[#6366f1]/90 hover:scale-105 active:scale-95
        transition-all duration-200"
    >
      <MessageCircle className="h-6 w-6" aria-hidden="true" />
    </Link>
  )
}
