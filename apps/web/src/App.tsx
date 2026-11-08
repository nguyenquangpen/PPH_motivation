import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Routes } from 'react-router-dom';
import { isApiError } from './api/client';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/ui';
import { DashboardPage } from './pages/Dashboard';
import { GoalsPage } from './pages/Goals';
import { GoalDetailPage } from './pages/GoalDetail';
import { TasksPage } from './pages/Tasks';
import { TaskDetailPage } from './pages/TaskDetail';
import { RewardsPage } from './pages/Rewards';
import { ActivityPage } from './pages/Activity';
import { SettingsPage } from './pages/Settings';
import { IntegrationsPage } from './pages/Integrations';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        refetchOnWindowFocus: false,
        // Don't retry client errors (404 for not-yet-implemented endpoints, validation, ...)
        retry: (count, err) => !(isApiError(err) && err.status >= 400 && err.status < 500) && count < 2,
      },
      mutations: { retry: false },
    },
  });
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="goals" element={<GoalsPage />} />
        <Route path="goals/:id" element={<GoalDetailPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="tasks/:id" element={<TaskDetailPage />} />
        <Route path="rewards" element={<RewardsPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="integrations" element={<IntegrationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<p className="muted">Không tìm thấy trang.</p>} />
      </Route>
    </Routes>
  );
}

export function App({ client }: { client: QueryClient }) {
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </QueryClientProvider>
  );
}
