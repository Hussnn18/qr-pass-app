import { useCurrentUser } from '../../store/session';
import ParticipantDashboard from '../participant/ParticipantDashboard';
import OrganizerDashboard from '../organizer/OrganizerDashboard';
import SecurityHome from '../security/SecurityHome';
import AdminDashboard from '../admin/AdminDashboard';

export default function Home() {
  const user = useCurrentUser();
  switch (user.role) {
    case 'ADMIN': return <AdminDashboard user={user} />;
    case 'ORGANIZER': return <OrganizerDashboard user={user} />;
    case 'SECURITY': return <SecurityHome user={user} />;
    default: return <ParticipantDashboard user={user} />;
  }
}
