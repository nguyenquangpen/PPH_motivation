import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { applyTheme, loadTheme, type Theme } from '../lib/theme';
import { NotificationBell } from './NotificationBell';
import { ResizeHandle, useResizable } from '../lib/useResizable';

const NAV = [
  { to: '/', label: 'Tổng quan', end: true },
  { to: '/goals', label: 'Mục tiêu' },
  { to: '/tasks', label: 'Công việc' },
  { to: '/rewards', label: 'Phần thưởng' },
  { to: '/activity', label: 'Hoạt động' },
  { to: '/integrations', label: 'Tích hợp' },
  { to: '/settings', label: 'Cài đặt' },
];

export function Layout() {
  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  useEffect(() => applyTheme(theme), [theme]);

  const [menu, setMenu] = useState(false); // mobile off-canvas menu
  const rz = useResizable({ storageKey: 'pph.sidebarWidth', initial: 208, min: 150, max: 380, dir: 1 });

  const { hash, pathname } = useLocation();
  useEffect(() => setMenu(false), [pathname]);
  useEffect(() => {
    if (!hash) return;
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 50);
    return () => clearTimeout(t);
  }, [hash, pathname]);

  return (
    <div className="flex min-h-screen min-w-0">
      {menu && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setMenu(false)} />}
      <aside
        style={{ '--sb': `${rz.width}px` } as React.CSSProperties}
        className={`fixed inset-y-0 left-0 z-40 w-64 shrink-0 border-r border-slate-200 bg-white transition-transform dark:border-slate-800 dark:bg-slate-900 md:relative md:inset-auto md:z-auto md:w-[var(--sb)] md:translate-x-0 ${menu ? 'translate-x-0' : '-translate-x-full'} ${rz.dragging ? 'select-none' : ''}`}
      >
        <ResizeHandle side="right" from="md" dragging={rz.dragging} {...rz.handleProps} />
        <div className="sticky top-0 flex h-screen flex-col overflow-y-auto">
          <div className="px-4 py-4 text-lg font-bold text-indigo-600 dark:text-indigo-400">Productivity Hub</div>
          <nav className="flex flex-col gap-0.5 px-2">
            {NAV.map((n) => (
              <NavLink
                key={n.to} to={n.to} end={n.end}
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-end gap-2 border-b border-slate-200 bg-white/90 px-3 py-2 backdrop-blur sm:px-6 dark:border-slate-800 dark:bg-slate-900/90">
          <button className="btn-ghost mr-auto md:hidden" onClick={() => setMenu(true)} aria-label="Mở menu">☰ Menu</button>
          <button
            className="btn-ghost" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
          >
            {theme === 'dark' ? '☀ Sáng' : '☾ Tối'}
          </button>
          <NotificationBell />
        </header>
        <main className="min-w-0 flex-1 px-3 py-4 sm:px-6 sm:py-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
