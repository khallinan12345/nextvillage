import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const VisitorTracker = () => {
  useEffect(() => {
    const trackPageView = async () => {
      const page_path = window.location.pathname;
      const user_agent = navigator.userAgent;

      let country_code = 'Unknown';
      try {
        const res = await fetch('https://ipapi.co/json/');
        if (res.ok) {
          const data = await res.json();
          country_code = data.country_code ?? data.country ?? 'Unknown';
        }
      } catch {
        country_code = 'Unknown';
      }

      try {
        await supabase.from('visitor_logs').insert({
          page_path,
          country_code,
          user_agent,
        });
      } catch {
        // Anonymous analytics — fail silently
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
