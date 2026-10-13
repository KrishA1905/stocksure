import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Package, ArrowLeftRight, RefreshCw, History, Menu, LogOut, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';

const NAV = {
  COORDINATOR: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/inventory', label: 'Inventory', icon: Package },
    { to: '/issues', label: 'Issues & Returns', icon: ArrowLeftRight },
    { to: '/renewals', label: 'Renewals', icon: RefreshCw },
  ],
  STUDENT: [
    { to: '/', label: 'My Items', icon: Package },
    { to: '/history', label: 'History', icon: History },
  ],
};

export default function AppLayout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const links = NAV[user.role] ?? [];

  const sidebar = (
    <aside className="grunge flex h-full w-64 flex-col">
      <div className="flex h-16 items-center justify-between border-b border-paper/25 px-5">
        <div className="flex items-center gap-3 font-display text-xl uppercase tracking-wide">
          <Package size={22} /> Dept. Inventory
        </div>
        <button className="md:hidden" onClick={() => setOpen(false)}><X size={18} /></button>
      </div>
      <nav className="flex-1 space-y-2 p-3">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-4 px-4 py-3 font-display text-lg uppercase tracking-wide transition-colors ${
                isActive ? 'bg-paper text-ink' : 'text-paper/60 hover:text-paper'
              }`
            }
          >
            <Icon size={20} strokeWidth={1.6} /> {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );

  return (
    <div className="flex h-screen">
      <div className="hidden md:block">{sidebar}</div>
      {open && <div className="fixed inset-0 z-40 flex bg-black/50 md:hidden">{sidebar}</div>}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-ink/30 px-4 md:px-8">
          <button className="md:hidden" onClick={() => setOpen(true)}><Menu size={22} /></button>
          <div className="ml-auto flex items-center gap-4 text-base font-semibold uppercase">
            <span className="hidden sm:inline">{user.name} · {user.role}</span>
            <button
              onClick={logout}
              className="flex items-center gap-2 border-[1.5px] border-ink px-3 py-1.5 font-bold transition-colors hover:bg-ink hover:text-paper"
            >
              <LogOut size={16} /> Logout
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-5 md:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
