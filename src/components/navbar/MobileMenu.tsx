import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import type { NavItem } from './navConfig';

function isActive(item: NavItem, pathname: string): boolean {
  if (pathname === item.to) return true;
  return item.matchPaths?.some((p) => pathname.startsWith(p)) ?? false;
}

export default function MobileMenu({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const ref = useRef<HTMLDivElement>(null);

  // Close on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

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
    <div ref={ref} className="md:hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={open}
        className="p-2 text-[#7A756E] hover:text-[#201F1E] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C1121F] rounded-lg"
      >
        {open ? (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute left-0 right-0 top-full bg-white border-b border-[#D8D5D0] shadow-md overflow-hidden z-50"
          >
            <div className="px-4 py-3 space-y-1">
              {items.map((item) => {
                const active = isActive(item, pathname);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`block px-3 py-2 rounded-lg text-sm font-medium transition ${
                      active
                        ? 'text-[#C1121F] bg-[#C1121F]/5'
                        : 'text-[#7A756E] hover:text-[#201F1E] hover:bg-[#F5F4F2]'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}

              <div className="border-t border-[#D8D5D0] mt-2 pt-2">
                <p className="px-3 py-1 text-xs text-[#7A756E] truncate">{user?.email}</p>
                <button
                  onClick={() => {
                    setOpen(false);
                    logout();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-[#7A756E] hover:text-[#C1121F] hover:bg-[#F5F4F2] transition"
                >
                  Logout
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
