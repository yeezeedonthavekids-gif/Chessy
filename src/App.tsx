import { Suspense, lazy, useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { reloadData } from './state/data';
import { startLiveStatusMonitor } from './state/liveStatus';
import { settingsStore } from './state/settings';
import { useStore } from './state/store';
import Dashboard from './pages/Dashboard';

const Analyze = lazy(() => import('./pages/Analyze'));
const Games = lazy(() => import('./pages/Games'));
const Coach = lazy(() => import('./pages/Coach'));
const Practice = lazy(() => import('./pages/Practice'));
const Openings = lazy(() => import('./pages/Openings'));
const Progress = lazy(() => import('./pages/Progress'));
const Settings = lazy(() => import('./pages/Settings'));

function useTheme() {
  const { theme } = useStore(settingsStore);
  useEffect(() => {
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

export default function App() {
  useTheme();
  useEffect(() => {
    void reloadData();
    startLiveStatusMonitor();
  }, []);

  return (
    <Layout>
      <Suspense fallback={<div className="page"><div className="spinner" /></div>}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/analyze" element={<Analyze />} />
          <Route path="/analyze/:gameId" element={<Analyze />} />
          <Route path="/games" element={<Games />} />
          <Route path="/coach" element={<Coach />} />
          <Route path="/practice" element={<Practice />} />
          <Route path="/openings" element={<Openings />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<div className="page"><h1>Page not found</h1></div>} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
