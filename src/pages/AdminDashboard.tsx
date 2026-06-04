import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function AdminDashboard() {
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    const fetchUsers = async () => {
      const { data, error } = await supabase.from('profiles').select('*');
      if (!error) setUsers(data ?? []);
    };
    fetchUsers();
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h2>Active Student Logs</h2>
      <ul>
        {users.map((user) => (
          <li key={user.id}>
            {user.email || user.username || user.full_name || 'Registered User'} - Active
          </li>
        ))}
      </ul>
    </div>
  );
}
