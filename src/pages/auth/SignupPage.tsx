import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import AuthForm from '../../components/auth/AuthForm';
import { useAuth } from '../../hooks/useAuth';

const SignupPage: React.FC = () => {
  const { user, loading } = useAuth();

  // Redirect to dashboard if already logged in
  if (user && !loading) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h1 className="text-center text-3xl font-extrabold text-blue-600">
          nextVillage.community
        </h1>
        <p className="mt-2 text-center text-sm text-gray-600">
          Join our platform for AI learning and collaboration
        </p>
      </div>
      
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-sm sm:rounded-lg sm:px-10">
          <AuthForm mode="signup" />
        </div>
        <p className="mt-4 text-center text-xs text-gray-500">
          Learners under 18 need a parent or guardian’s permission, which your group leader records. <Link to="/privacy" className="underline hover:text-gray-700">How we handle your information</Link>
        </p>
      </div>
    </div>
  );
};

export default SignupPage;