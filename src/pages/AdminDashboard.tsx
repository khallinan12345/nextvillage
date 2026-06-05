import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';

type MockUser = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  grade_level: string;
  gender: 'female' | 'male' | 'other';
  continent: string;
  country: string;
  state_province: string;
  city?: string;
  school?: string;
  status: 'Active' | 'Idle' | 'Offline';
  is_active?: boolean;
  last_seen?: string;
  created_at?: string;
  updated_at?: string;
};

function random<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateMockUsers(count = 120): MockUser[] {
  const first = ['Amina', 'Chinenye', 'Grace', 'Silas', 'Mary', 'Ifeoma', 'Kofi', 'Fatima', 'Tunde', 'Ola'];
  const last = ['Okoro', 'Smith', 'Johnson', 'Mary', 'Ibekwe', 'Abiola', 'Chen', 'Wang', 'Garcia', 'Brown'];
  const continents = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'];
  const countries = ['Nigeria', 'United States', 'United Kingdom', 'Canada', 'Kenya', 'India', 'Australia'];
  const states = ['Lagos', 'Bayelsa', 'California', 'Texas', 'Ontario', 'Delhi', 'New South Wales', 'London'];
  const cities = ['Lagos', 'Abuja', 'London', 'New York', 'Toronto', 'Delhi', 'Sydney'];
  const grades = [
    'Elementary [Grades 3–5 / Ages 8–11]',
    'Middle School [Grades 6–8 / Ages 11–14]',
    'High School [Grades 9–12 / Ages 14–18]',
  ];
  const genders: MockUser['gender'][] = ['female', 'male', 'other'];
  const statuses: MockUser['status'][] = ['Active', 'Idle', 'Offline'];

  const users: MockUser[] = [];
  const now = Date.now();
  for (let i = 0; i < count; i += 1) {
    const f = random(first);
    const l = random(last);
    const full = `${f} ${l}`;
    const country = random(countries);
    const isActive = Math.random() > 0.4;
    const lastSeenOffset = isActive ? Math.random() * 5 * 60 * 1000 : 30 * 60 * 1000 + Math.random() * 6 * 60 * 60 * 1000;

    users.push({
      id: `mock-${i + 1}`,
      full_name: full,
      email: `${f.toLowerCase()}.${l.toLowerCase()}${i + 1}@example.com`,
      role: 'Student',
      grade_level: random(grades),
      gender: random(genders),
      continent: random(continents),
      country,
      state_province: random(states),
      city: random(cities),
      school: Math.random() > 0.4 ? `${f} ${l} Academy` : undefined,
      status: isActive ? 'Active' : random(['Idle', 'Offline']),
      is_active: isActive,
      last_seen: new Date(now - lastSeenOffset).toISOString(),
    });
  }
  return users;
}

function normalizeProfileRecord(p: any): MockUser {
  return {
    id: p.id ?? p.user_id ?? String(p.email ?? p.id ?? Math.random()),
    full_name: p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email || 'User',
    email: p.email || p.user_email || 'unknown@example.com',
    role: p.role || 'Student',
    grade_level: p.grade_level || 'High School [Grades 9–12 / Ages 14–18]',
    gender: p.gender || 'other',
    continent: p.continent || 'Unknown',
    country: p.country || 'Unknown',
    state_province: p.state || p.state_province || 'Unknown',
    city: p.city || '',
    school: p.school || '',
    status: p.status || 'Active',
    is_active: typeof p.is_active === 'boolean' ? p.is_active : false,
    last_seen: p.last_seen ? new Date(p.last_seen).toISOString() : undefined,
    created_at: p.created_at ? new Date(p.created_at).toISOString() : undefined,
    updated_at: p.updated_at ? new Date(p.updated_at).toISOString() : undefined,
  };
}

export default function AdminDashboard() {
  const [users, setUsers] = useState<MockUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MockUser | null>(null);
  const [filterType, setFilterType] = useState<'location' | 'name' | 'email'>('location');

  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<string>('');

  // derive a list of unique, non-empty location strings from users (city/state/country/continent)
  const uniqueLocations = useMemo(() => {
    const s = new Set<string>();
    users.forEach(u => {
      [u.city, u.state_province, u.country, u.continent].forEach(v => {
        if (v && String(v).trim()) s.add(String(v).trim());
      });
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [users]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const { data, error } = await supabase.from('profiles').select('*');
        if (!error && Array.isArray(data) && data.length > 0) {
          const mapped = data.map((p: any) => normalizeProfileRecord(p));
          setUsers(mapped);
        } else {
          setUsers(generateMockUsers(120));
        }
      } catch (e) {
        setUsers(generateMockUsers(120));
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  const upsertUser = (updated: MockUser) => {
    setUsers((prev) => [updated, ...prev.filter((u) => u.id !== updated.id)]);
  };

  useEffect(() => {
    const channel = supabase
      .channel('profiles-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' }, (payload) => {
        if (!payload.new) return;
        upsertUser(normalizeProfileRecord(payload.new));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
        if (!payload.new) return;
        upsertUser(normalizeProfileRecord(payload.new));
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  const saveLocal = (updated: MockUser) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    setSelected(null);
  };

  const isUserCurrentlyOnline = (user: MockUser) => {
    if (user.is_active === true) return true;
    if (!user.last_seen) return false;
    const lastSeen = new Date(user.last_seen).getTime();
    return Date.now() - lastSeen < 5 * 60 * 1000;
  };

  const getActivityDotClass = (user: MockUser) => {
    if (isUserCurrentlyOnline(user)) return 'bg-emerald-500';
    if (user.status === 'Idle') return 'bg-amber-400';
    return 'bg-gray-400';
  };

  const getStatusDisplay = (user: MockUser) => {
    if (isUserCurrentlyOnline(user)) {
      return {
        label: '🟢 Active',
        style: 'bg-green-100 text-green-800',
        subtitle: 'Online now',
      };
    }
    if (user.status === 'Idle') {
      return {
        label: '🟡 Idle',
        style: 'bg-yellow-100 text-yellow-800',
        subtitle: 'Inactive recently',
      };
    }
    return {
      label: '⚫ Offline',
      style: 'bg-gray-100 text-gray-600',
      subtitle: 'Inactive recently',
    };
  };

  const filteredUsers = useMemo(() => {
    const q = activeSearch.trim().toLowerCase();

    const matchesSearch = (u: MockUser) => {
      if (!q) return true;
      if (filterType === 'name') return u.full_name.toLowerCase().includes(q);
      if (filterType === 'email') return u.email.toLowerCase().includes(q);
      const locationString = [u.city, u.state_province, u.country, u.continent].filter(Boolean).join(' ').toLowerCase();
      return locationString.includes(q);
    };

    const matchesSelectedLocation = (u: MockUser) => {
      if (!selectedLocation) return true;
      const check = selectedLocation.toLowerCase();
      return [u.city, u.state_province, u.country, u.continent].some(v => v && v.toLowerCase() === check);
    };

    return users.filter(u => matchesSearch(u) && matchesSelectedLocation(u));
  }, [users, activeSearch, filterType, selectedLocation]);

  const sortedUsers = useMemo(() => {
    return [...filteredUsers].sort((a, b) => {
      const aActive = isUserCurrentlyOnline(a);
      const bActive = isUserCurrentlyOnline(b);
      if (aActive !== bActive) return aActive ? -1 : 1;

      const aTimestamp = new Date(a.updated_at || a.created_at || 0).getTime();
      const bTimestamp = new Date(b.updated_at || b.created_at || 0).getTime();
      if (aTimestamp !== bTimestamp) return bTimestamp - aTimestamp;

      return a.full_name.localeCompare(b.full_name);
    });
  }, [filteredUsers]);

  return (
    <div className="p-6 font-sans">
      <h2 className="text-2xl font-semibold mb-4">Teacher Dashboard — Active Students</h2>

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Filter By</span>
          <select
            className="mt-1 block w-full border rounded px-3 py-2"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as 'location' | 'name' | 'email')}
          >
            <option value="location">Location</option>
            <option value="name">Name</option>
            <option value="email">Email</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Search</span>
          <input
            type="text"
            className="mt-1 block w-full border rounded px-3 py-2"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={filterType === 'location' ? 'Search by city, state, country, continent' : filterType === 'name' ? 'Search by name' : 'Search by email'}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Location</span>
          <select
            className="mt-1 block rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
          >
            <option value="">All Locations</option>
            {uniqueLocations.map(loc => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
        </label>

        <div className="flex items-end gap-2">
          <button
            type="button"
            className="inline-flex justify-center rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            onClick={() => setActiveSearch(searchQuery)}
          >
            Search
          </button>
          <button
            type="button"
            className="inline-flex justify-center rounded border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
            onClick={() => {
              setSearchQuery('');
              setActiveSearch('');
              setSelectedLocation('');
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : (
        <div className="bg-white shadow rounded border overflow-x-auto">
          <table className="min-w-full divide-y">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Name</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Email</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Role</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Grade Level</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">State / Province</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Country / Continent</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-sm text-gray-500" colSpan={8}>
                    No users match the selected filter. Try a different search term.
                  </td>
                </tr>
              ) : (
                sortedUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-800">
                      <div className="inline-flex items-center gap-2">
                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${getActivityDotClass(u)}`} />
                        <span>{u.full_name}</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {getStatusDisplay(u).subtitle}
                        {u.last_seen ? ` · last seen ${new Date(u.last_seen).toLocaleString()}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{u.email}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {u.role}
                      <div className="text-xs text-gray-400">assigned by your organization</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{u.grade_level}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{u.state_province}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{u.country} / {u.continent}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded ${getStatusDisplay(u).style}`}>
                        {getStatusDisplay(u).label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setSelected(u)} className="px-3 py-1 bg-blue-600 text-white text-sm rounded">View Profile</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded shadow-lg w-full max-w-2xl p-6">
            <h3 className="text-xl font-semibold mb-2">My Profile - Manage your personal information and track your learning progress.</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium">Full Name *</label>
                <input className="mt-1 block w-full border rounded px-3 py-2" value={selected.full_name} onChange={(e) => setSelected({ ...selected, full_name: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium">Email Address *</label>
                <input className="mt-1 block w-full border rounded px-3 py-2" value={selected.email} onChange={(e) => setSelected({ ...selected, email: e.target.value })} />
              </div>

              <div>
                <label className="block text-sm font-medium">Role</label>
                <div className="mt-1 text-sm text-gray-700">Student <span className="text-xs text-gray-400">assigned by your organization</span></div>
              </div>
              <div>
                <label className="block text-sm font-medium">Grade Level *</label>
                <select className="mt-1 block w-full border rounded px-3 py-2" value={selected.grade_level} onChange={(e) => setSelected({ ...selected, grade_level: e.target.value })}>
                  <option>Elementary [Grades 3–5 / Ages 8–11]</option>
                  <option>Middle School [Grades 6–8 / Ages 11–14]</option>
                  <option>High School [Grades 9–12 / Ages 14–18]</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium">Gender</label>
                <select className="mt-1 block w-full border rounded px-3 py-2" value={selected.gender} onChange={(e) => setSelected({ ...selected, gender: e.target.value as MockUser['gender'] })}>
                  <option value="female">female</option>
                  <option value="male">male</option>
                  <option value="other">other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium">Continent</label>
                <input className="mt-1 block w-full border rounded px-3 py-2" value={selected.continent} onChange={(e) => setSelected({ ...selected, continent: e.target.value })} />
              </div>

              <div>
                <label className="block text-sm font-medium">State / Province</label>
                <input className="mt-1 block w-full border rounded px-3 py-2" value={selected.state_province} onChange={(e) => setSelected({ ...selected, state_province: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium">Country</label>
                <input className="mt-1 block w-full border rounded px-3 py-2" value={selected.country} onChange={(e) => setSelected({ ...selected, country: e.target.value })} />
              </div>

              <div>
                <label className="block text-sm font-medium">City</label>
                <input className="mt-1 block w-full border rounded px-3 py-2" value={selected.city || ''} onChange={(e) => setSelected({ ...selected, city: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium">School / Organization (optional)</label>
                <input className="mt-1 block w-full border rounded px-3 py-2" value={selected.school || ''} onChange={(e) => setSelected({ ...selected, school: e.target.value })} />
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button className="px-4 py-2 border rounded" onClick={() => setSelected(null)}>Cancel</button>
              <button className="px-4 py-2 bg-blue-600 text-white rounded" onClick={() => saveLocal(selected)}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
