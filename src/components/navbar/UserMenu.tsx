import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';

function getInitials(email: string | null | undefined): string {
  if (!email) return '?';
  return email.charAt(0).toUpperCase();
}

export default function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        className="h-9 w-9 rounded-full bg-[#C1121F] text-white text-sm font-semibold flex items-center justify-center hover:bg-[#9B0E18] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C1121F] focus-visible:ring-offset-2"
      >
        {getInitials(user?.email)}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            role="menu"
            className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-[#D8D5D0] py-2 z-50"
          >
            <div className="px-4 py-2 border-b border-[#D8D5D0]">
              <p className="text-xs text-[#7A756E]">Signed in as</p>
              <p className="text-sm font-medium text-[#201F1E] truncate">
                {user?.email}
              </p>
            </div>
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                logout();
              }}
              className="w-full text-left px-4 py-2 text-sm text-[#7A756E] hover:bg-[#F5F4F2] hover:text-[#C1121F] transition"
            >
              Logout
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
