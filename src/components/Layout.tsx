import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { settingsStore } from '../state/settings';
import { useStore } from '../state/store';
import { FairPlayPill } from './FairPlay';
import {
  IconAnalyze,
  IconBook,
  IconCoach,
  IconGames,
  IconHome,
  IconMenu,
  IconMoon,
  IconPractice,
  IconProgress,
  IconSettings,
  IconSidebar,
  IconSun,
} from './Icons';
import { Logo, Wordmark } from './Logo';

const NAV = [
  { to: '/', label: 'Dashboard', icon: IconHome, end: true },
  { to: '/analyze', label: 'Analyze Game', icon: IconAnalyze },
  { to: '/games', label: 'My Games', icon: IconGames },
  { to: '/coach', label: 'AI Coach', icon: IconCoach },
  { to: '/practice', label: 'Practice', icon: IconPractice },
  { to: '/openings', label: 'Openings', icon: IconBook },
  { to: '/progress', label: 'Progress', icon: IconProgress },
  { to: '/settings', label: 'Settings', icon: IconSettings },
];

export function Layout({ children }: { children: ReactNode }) {
  const settings = useStore(settingsStore);
  const collapsed = settings.sidebarCollapsed;
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMobileOpen(false), [location.pathname]);

  const toggleTheme = () =>
    settingsStore.set((s) => ({ ...s, theme: document.documentElement.dataset.theme === 'light' ? 'dark' : 'light' }));

  return (
    <div className="app">
      {mobileOpen && <div className="scrim" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'open' : ''}`} aria-label="Main navigation">
        <div className="sidebar-brand">
          <Logo size={30} />
          <Wordmark />
        </div>
        <nav className="nav">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')} title={collapsed ? label : undefined}>
              <Icon />
              <span className="nav-label">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <FairPlayPill collapsed={collapsed} />
          <div className="row" style={{ justifyContent: collapsed ? 'center' : 'space-between' }}>
            <button className="btn ghost icon collapse-btn" title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => settingsStore.set((s) => ({ ...s, sidebarCollapsed: !s.sidebarCollapsed }))}>
              <IconSidebar />
            </button>
            {!collapsed && (
              <button className="btn ghost icon" title="Toggle light/dark theme" onClick={toggleTheme}>
                {settings.theme === 'light' ? <IconMoon /> : <IconSun />}
              </button>
            )}
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="btn ghost icon" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
            <IconMenu />
          </button>
          <div className="row">
            <Logo size={24} />
            <Wordmark />
          </div>
          <span style={{ width: 34 }} />
        </header>
        {children}
      </div>
    </div>
  );
}
