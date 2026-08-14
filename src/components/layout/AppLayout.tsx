import React, { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import Navbar from './Navbar';
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
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div>
      </div>
    );
  }

  if (requireAuth && !session && !user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-paper text-body antialiased">
      <Navbar />

      <div className="flex">
        <main className="flex-1 min-w-0 p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AppLayout;