import { Route, Routes } from 'react-router-dom';
import { PortalLayout, PublicLayout, RequireAuth, RequireRole } from './components/layout/Layouts';
import Login from './pages/auth/Login';
import ChangePassword from './pages/auth/ChangePassword';
import Home from './pages/common/Home';
import Profile from './pages/common/Profile';
import NotFound from './pages/common/NotFound';
import Events from './pages/participant/Events';
import EventDetail from './pages/participant/EventDetail';
import MyRegistrations from './pages/participant/MyRegistrations';
import MyPasses from './pages/participant/MyPasses';
import ManageEvents from './pages/organizer/ManageEvents';
import EventForm from './pages/organizer/EventForm';
import EventManage from './pages/organizer/EventManage';
import SecurityHome from './pages/security/SecurityHome';
import Scanner from './pages/security/Scanner';
import ScanHistory from './pages/security/ScanHistory';
import Users from './pages/admin/Users';
import StudentImport from './pages/admin/StudentImport';
import Departments from './pages/admin/Departments';
import Venues from './pages/admin/Venues';

const MANAGERS = ['ORGANIZER', 'ADMIN'];
const SCANNERS = ['SECURITY', 'ORGANIZER', 'ADMIN'];

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/login" element={<Login />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<PortalLayout />}>
          <Route index element={<Home />} />
          <Route path="change-password" element={<ChangePassword />} />
          <Route path="profile" element={<Profile />} />
          <Route path="events" element={<Events />} />
          <Route path="events/:id" element={<EventDetail />} />

          <Route element={<RequireRole roles={['STUDENT', 'GUEST']} />}>
            <Route path="my/registrations" element={<MyRegistrations />} />
            <Route path="my/passes" element={<MyPasses />} />
          </Route>

          <Route element={<RequireRole roles={MANAGERS} />}>
            <Route path="manage/events" element={<ManageEvents />} />
            <Route path="manage/events/new" element={<EventForm />} />
            <Route path="manage/events/:id" element={<EventManage />} />
            <Route path="manage/events/:id/edit" element={<EventForm />} />
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
            <Route path="admin/venues" element={<Venues />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
