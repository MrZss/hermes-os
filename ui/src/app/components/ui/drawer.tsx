import * as React from "react"
import { X } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function Drawer({ isOpen, onClose, title, children, footer }: DrawerProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-zinc-950/18 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[520px] flex-col border-l border-zinc-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.15)]"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-200/80 px-6 py-5">
              <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              {children}
            </div>

            {footer && (
              <div className="shrink-0 border-t border-zinc-200/80 bg-[#faf9f6] px-6 py-5">
                {footer}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
