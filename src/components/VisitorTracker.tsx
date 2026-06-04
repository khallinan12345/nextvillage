import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const VisitorTracker = () => {
  useEffect(() => {
    const trackPageView = async () => {
      const page_path = window.location.pathname;
      const user_agent = navigator.userAgent;

      let data: { country_code?: string; country?: string } | null = null;
      try {
        const res = await fetch('https://ipapi.co/json/');
        if (res.ok) {
          data = await res.json();
        }
      } catch {
        data = null;
      }

      const { data: authData } = await supabase.auth.getUser();

      try {
        await supabase.from('visitor_logs').insert({
          page_path,
          country_code: data?.country_code || 'Unknown',
          user_agent,
          user_email: authData?.user?.email || 'Anonymous',
        });
      } catch {
        // Analytics — fail silently
      }
    };

    const handleLocationChange = () => {
      void trackPageView();
    };

    void trackPageView();

    window.addEventListener('popstate', handleLocationChange);

    const { pushState, replaceState } = history;
    history.pushState = function (...args) {
      pushState.apply(this, args);
      handleLocationChange();
    };
    history.replaceState = function (...args) {
      replaceState.apply(this, args);
      handleLocationChange();
    };

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      history.pushState = pushState;
      history.replaceState = replaceState;
    };
  }, []);

  return null;
};

export default VisitorTracker;
