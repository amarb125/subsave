import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { ForgotPassword, Login, Signup, UpdatePassword } from '@/pages/Auth';
import Calendar from '@/pages/Calendar';
import Dashboard from '@/pages/Dashboard';
import Leaks from '@/pages/Leaks';
import Onboarding from '@/pages/Onboarding';
import Reports from '@/pages/Reports';
import Settings from '@/pages/Settings';
import Setup from '@/pages/Setup';
import SubscriptionDetails from '@/pages/SubscriptionDetails';
import { EditSubscription, NewSubscription } from '@/pages/SubscriptionFormPages';
import Subscriptions from '@/pages/Subscriptions';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/update-password" element={<UpdatePassword />} />
      <Route path="/setup" element={<Setup />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="onboarding" element={<Onboarding />} />
          <Route path="subscriptions" element={<Subscriptions />} />
          <Route path="subscriptions/new" element={<NewSubscription />} />
          <Route path="subscriptions/:id" element={<SubscriptionDetails />} />
          <Route path="subscriptions/:id/edit" element={<EditSubscription />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="leaks" element={<Leaks />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
