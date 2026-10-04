import { Route, Routes } from 'react-router-dom';
import { PortalLayout, PublicLayout, RequireAuth, RequireRole } from './components/layout/Layouts';
import Login from './pages/auth/Login';
import GuestSignup from './pages/auth/GuestSignup';
import ForgotPassword from './pages/auth/ForgotPassword';
import ChangePassword from './pages/auth/ChangePassword';
import Home from './pages/common/Home';
import Profile from './pages/common/Profile';
import Notifications from './pages/common/Notifications';
import CampusMapPage from './pages/common/CampusMapPage';
import NotFound from './pages/common/NotFound';
import Events from './pages/participant/Events';
import EventDetail from './pages/participant/EventDetail';
import MyRegistrations from './pages/participant/MyRegistrations';
import MyPasses from './pages/participant/MyPasses';
import ManageEvents from './pages/organizer/ManageEvents';
import EventForm from './pages/organizer/EventForm';
import EventManage from './pages/organizer/EventManage';
import LivePicker from './pages/organizer/LivePicker';
import Analytics from './pages/organizer/Analytics';
import Reports from './pages/organizer/Reports';
import SecurityHome from './pages/security/SecurityHome';
import Scanner from './pages/security/Scanner';
import ScanHistory from './pages/security/ScanHistory';
import Users from './pages/admin/Users';
import StudentImport from './pages/admin/StudentImport';
import Departments from './pages/admin/Departments';
import CampusAdmin from './pages/admin/CampusAdmin';
import AuditLog from './pages/admin/AuditLog';

const PARTICIPANTS = ['STUDENT', 'GUEST'];
const MANAGERS = ['ORGANIZER', 'ADMIN'];
const SCANNERS = ['SECURITY', 'ORGANIZER', 'ADMIN'];

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<GuestSignup />} />
        <Route path="/forgot" element={<ForgotPassword />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<PortalLayout />}>
          <Route index element={<Home />} />
          <Route path="change-password" element={<ChangePassword />} />
          <Route path="events" element={<Events />} />
          <Route path="events/:id" element={<EventDetail />} />
          <Route path="campus" element={<CampusMapPage />} />
          <Route path="profile" element={<Profile />} />
          <Route path="notifications" element={<Notifications />} />

          <Route element={<RequireRole roles={PARTICIPANTS} />}>
            <Route path="my/registrations" element={<MyRegistrations />} />
            <Route path="my/passes" element={<MyPasses />} />
          </Route>

          <Route element={<RequireRole roles={MANAGERS} />}>
            <Route path="manage/events" element={<ManageEvents />} />
            <Route path="manage/events/new" element={<EventForm />} />
            <Route path="manage/events/:id" element={<EventManage />} />
            <Route path="manage/events/:id/edit" element={<EventForm />} />
            <Route path="manage/live" element={<LivePicker />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="reports" element={<Reports />} />
          </Route>

          <Route element={<RequireRole roles={SCANNERS} />}>
            <Route path="scan" element={<Scanner />} />
            <Route path="scan/history" element={<ScanHistory />} />
          </Route>
          <Route element={<RequireRole roles={['SECURITY']} />}>
            <Route path="scan/assignments" element={<SecurityHome />} />
          </Route>

          <Route element={<RequireRole roles={['ADMIN']} />}>
            <Route path="admin/users" element={<Users />} />
            <Route path="admin/import" element={<StudentImport />} />
            <Route path="admin/departments" element={<Departments />} />
            <Route path="admin/campus" element={<CampusAdmin />} />
            <Route path="admin/audit" element={<AuditLog />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
