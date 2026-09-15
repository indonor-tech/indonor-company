import React from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { CircularProgress, Box } from '@mui/material';
import { useAuth } from './context/AuthContext';
import AppLayout from './layouts/AppLayout';
import Dashboard from './pages/Dashboard';
import EntityPage from './pages/EntityPage';
import Pipeline from './pages/Pipeline';
import Interviews from './pages/Interviews';
import InterviewDetail from './pages/InterviewDetail';
import Catalogs from './pages/Catalogs';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import CandidateIntake from './pages/CandidateIntake';
import Notifications from './pages/Notifications';
import Email from './pages/Email';
import Login from './pages/Login';
import ContactSubmissions from './pages/ContactSubmissions';
import WebsiteAnalytics from './pages/WebsiteAnalytics';
import WebsiteTeam from './pages/WebsiteTeam';
import WebsiteProjects from './pages/WebsiteProjects';
import Users from './pages/Users';
import MyProfile from './pages/MyProfile';
import Letters from './pages/Letters';

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function Require({ permission, permissions, roles, children }) {
  const { can, is } = useAuth();
  if (permission && !can(permission)) return <Navigate to="/" replace />;
  if (permissions?.length && !permissions.some((item) => can(item))) return <Navigate to="/" replace />;
  if (roles?.length && !is(...roles)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected />}>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="me" element={<MyProfile />} />
          <Route path="users" element={<Require permission="users:read"><Users /></Require>} />
          <Route path="employees" element={<Require permission="employee:read"><EntityPage type="employees" /></Require>} />
          <Route path="employees/:id" element={<Require permission="employee:read"><Profile type="employees" /></Require>} />
          <Route path="candidates" element={<Require permission="candidate:read"><EntityPage type="candidates" /></Require>} />
          <Route path="candidates/new" element={<Require permission="candidate:create"><CandidateIntake /></Require>} />
          <Route path="candidates/:id" element={<Require permission="candidate:read"><Profile type="candidates" /></Require>} />
          <Route path="pipeline" element={<Require permission="candidate:read"><Pipeline /></Require>} />
          <Route path="interviews" element={<Require permission="interview:read"><Interviews /></Require>} />
          <Route path="interviews/:id" element={<Require permission="interview:read"><InterviewDetail /></Require>} />
          <Route path="contact-submissions" element={<Require permission="contact:read"><ContactSubmissions /></Require>} />
          <Route path="website-analytics" element={<Require permission="analytics:read"><WebsiteAnalytics /></Require>} />
          <Route path="website-team" element={<Require permission="website:read"><WebsiteTeam /></Require>} />
          <Route path="website-projects" element={<Require permission="website:read"><WebsiteProjects /></Require>} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="email" element={<Require permission="email:send"><Email /></Require>} />
          <Route path="letters/offer" element={<Require permissions={['employee:update', 'candidate:update']}><Letters kind="offer" /></Require>} />
          <Route path="letters/agreement" element={<Require permission="employee:update"><Letters kind="agreement" /></Require>} />
          <Route path="letters/relieving" element={<Require permission="employee:update"><Letters kind="relieving" /></Require>} />
          <Route path="letters/company-card" element={<Require permission="employee:update"><Letters kind="company-card" /></Require>} />
          <Route path="catalogs" element={<Require permission="catalog:read"><Catalogs /></Require>} />
          <Route path="reports" element={<Require permission="reports:read"><Reports /></Require>} />
          <Route path="settings" element={<Require roles={['SUPER_ADMIN', 'ADMIN']}><Settings /></Require>} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
