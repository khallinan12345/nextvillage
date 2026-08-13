// src/components/auth/RequireAuth.tsx
//
// Single gate for every route that isn't explicitly public. Wraps a block of
// <Route> children in App.tsx as a pathless layout route, so it can't be
// bypassed by a page that forgets to check auth itself — the redirect to
// /login happens before any child route element ever renders.
//
// AppLayout has its own, separate requireAuth check for pages that render
// the site chrome (Navbar + sidebar). That's still doing real work — it
// covers a page rendered directly in tests or storybook-style contexts,
// outside the router. This component is the check that actually matters for
// real visitors, since it runs before AppLayout (or a page with no
// AppLayout at all) ever mounts.

import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const RequireAuth: React.FC = () => {
  const { user, session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!session && !user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default RequireAuth;
