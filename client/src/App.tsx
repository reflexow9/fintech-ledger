import { AuthProvider } from './context/AuthContext';
import { DashboardPage } from './pages/DashboardPage';

export default function App(): JSX.Element {
  return (
    <AuthProvider>
      <DashboardPage />
    </AuthProvider>
  );
}
