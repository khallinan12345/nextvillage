import React, { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import { useAuth } from '../../hooks/useAuth';

interface AppLayoutProps {
  children: ReactNode;
  requireAuth?: boolean;
}

const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  requireAuth = true,
}) => {
  const { user, session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (requireAuth && !session && !user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="flex">
        {/* Sidebar hidden on mobile, visible md+ */}
        {user && (
          <div className="hidden md:block">
            <Sidebar />
          </div>
        )}
        {/* No left margin on mobile; sidebar margin only on md+ */}
        <main className={`flex-1 min-w-0 p-6 ${user ? 'md:ml-64' : ''}`}>
          {children}
        </main>
      </div>
    </div>
  );
};

export default AppLayout;