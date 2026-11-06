import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { applyTheme, loadTheme, type Theme } from '../lib/theme';
import { NotificationBell } from './NotificationBell';

const NAV = [
  { to: '/', label: 'Tổng quan', end: true },
  { to: '/goals', label: 'Mục tiêu' },
  { to: '/tasks', label: 'Công việc' },
  { to: '/rewards', label: 'Phần thưởng' },
  { to: '/activity', label: 'Hoạt động' },
  { to: '/settings', label: 'Cài đặt' },
];

export function Layout() {
  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  useEffect(() => applyTheme(theme), [theme]);

  const { hash, pathname } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 50);
    return () => clearTimeout(t);
  }, [hash, pathname]);

  return (
    <div className="flex h-full min-w-0">
      <aside className="sticky top-0 flex h-screen w-52 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
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
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-end gap-2 border-b border-slate-200 bg-white/90 px-6 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
          <button
            className="btn-ghost" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
          >
            {theme === 'dark' ? '☀ Sáng' : '☾ Tối'}
          </button>
          <NotificationBell />
        </header>
        <main className="min-w-0 flex-1 px-6 py-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
