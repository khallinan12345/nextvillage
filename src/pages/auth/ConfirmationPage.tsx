import React from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';

const ConfirmationPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h1 className="text-center text-3xl font-extrabold text-blue-600">
          Check your email
        </h1>
      </div>
      
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-sm sm:rounded-lg sm:px-10 text-center">
          <div className="rounded-full bg-green-100 p-3 mx-auto w-16 h-16 flex items-center justify-center mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            Confirmation email sent!
          </h2>
          
          <p className="text-gray-600 mb-6">
            We've sent a confirmation email to your address. Please check your inbox and click the confirmation link to activate your account.
          </p>
          
          <div className="stack-y-4">
            <p className="text-sm text-gray-500">
              Didn't receive the email? Check your spam folder or try signing in - you might already be confirmed.
            </p>
            
            <Link to="/login">
              <Button variant="outline" fullWidth>
                Return to login
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationPage;