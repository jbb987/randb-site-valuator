import { Link, useLocation } from 'react-router-dom';
import type { NavItem } from './navConfig';

function isActive(item: NavItem, pathname: string): boolean {
  if (pathname === item.to) return true;
  return item.matchPaths?.some((p) => pathname.startsWith(p)) ?? false;
}

export default function NavLinks({ items }: { items: NavItem[] }) {
  const { pathname } = useLocation();

  return (
    <div className="hidden md:flex items-center gap-6">
      {items.map((item) => {
        const active = isActive(item, pathname);
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={active ? 'page' : undefined}
            className={`text-sm font-medium transition border-b-2 pb-0.5 ${
              active
                ? 'text-[#201F1E] border-[#C1121F]'
                : 'text-[#7A756E] border-transparent hover:text-[#201F1E]'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
