import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { Menu, X, Sparkles, LogOut, ShieldCheck } from 'lucide-react';
import classNames from 'classnames';
import { useBranding } from '../../lib/useBranding';

const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // Admin link visible to leaders and platform administrators
  const isLeaderOrAdmin =
    user?.role === 'site_leader' ||
    user?.role === 'research_lead' ||
    user?.role === 'platform_administrator';

  const [isOpen, setIsOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [researchPrograms, setResearchPrograms] = useState<{name: string; path: string}[]>([
    { name: 'AI Learning Lab', path: '/research/ai-learning-lab' },
    { name: 'IGiTREE',         path: '/research/igitree'         },
  ]);

  useEffect(() => {
    supabase
      .from('research_programs')
      .select('slug, title')
      .eq('status', 'active')
      .order('created_at')
      .then(({ data }) => {
        if (data?.length) {
          const dynamic = data.map((p: any) => ({
            name: p.title,
            path: `/research/${p.slug}`,
          }));
          setResearchPrograms([...dynamic, { name: '+ Propose Research', path: '/research/new' }]);
        } else {
          setResearchPrograms(prev => [...prev, { name: '+ Propose Research', path: '/research/new' }]);
        }
      });
  }, []);
  const branding = useBranding();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const navigationLinks = [
    { name: 'Home', path: '/home', shorthand: 'Home' },
    {
      name: 'Foundations',
      shorthand: 'Foundations',
      dropdown: [
        { name: 'English Skills', path: '/english-skills' },
        { name: 'Math Skills',    path: '/math-skills'    },
        { name: 'Science Skills', path: '/science-skills' },
      ],
    },
    {
      name: 'Learning',
      shorthand: 'Learning',
      dropdown: [
        { name: 'AI Learning', path: '/learning/ai' },
        { name: 'Skills Development', path: '/learning/skills' },
      ],
    },
    {
      name: 'Tech Skills Workshop',
      shorthand: 'Tech Skills',
      dropdown: [
        { name: 'Vibe Coding', path: '/tech-skills/vibe-coding' },
        { name: 'Vite/React Web Site Development', path: '/tech-skills/web-development' },
        { name: 'Full-Stack App Development', path: '/tech-skills/full-stack-development' },
        { name: 'AI Image Creation', path: '/tech-skills/ai-image-creation' },
        { name: 'AI Voice Creation', path: '/tech-skills/ai-voice-creation' },
        { name: 'AI Video Creation', path: '/tech-skills/ai-video-creation' },
        { name: 'AI Video Studio', path: '/tech-skills/ai-video-studio' },
        { name: 'AI Content Creation', path: '/tech-skills/ai-content-creation' },
        { name: 'AI Workflow Development', path: '/tech-skills/ai-workflow-development' },
        { name: 'AI for Business', path: '/tech-skills/ai-for-business' },
        { name: 'Microsoft AI-900 Prep', path: '/tech-skills/microsoft-ai900' },
        { name: 'Microsoft DP-900 Prep', path: '/tech-skills/microsoft-dp900' },
        { name: 'Microsoft AB-730 Prep', path: '/tech-skills/microsoft-ab730' },
        { name: 'GitHub Foundations GH-300 Prep', path: '/tech-skills/github-gh300' },
        { name: 'Employable Tech Skills Prep', path: '/tech-skills'},
      ],
    },
    {
      name: 'Certifications',
      shorthand: 'Certs',
      dropdown: [
        { name: 'AI Proficiency', path: '/certifications/ai-proficiency' },
        { name: 'AI Ready Skills', path: '/certifications/ai-ready-skills' },
        { name: 'Vibe Coding', path: '/certifications/vibe-coding' },
        { name: 'Web Dev Certification', path: '/certifications/web-dev-certification' },
        { name: 'Full-Stack Certification', path: '/certifications/full-stack-certification' },
        { name: 'AI Video Production', path: '/certifications/ai-video-production' },
        { name: 'AI Image Creation', path: '/certifications/ai-image-creation-cert' },
        { name: 'AI Voice Creation', path: '/certifications/ai-voice-creation' },
        { name: 'AI Workflow Dev', path: '/certifications/ai-workflow-dev' },
        { name: 'AI for Business', path: '/certifications/ai-for-business' },
      ],
    },
    {
      name: 'Community Impact',
      shorthand: 'Community',
      dropdown: [
        { name: 'AI Ambassadors', path: '/community-impact/ai-ambassadors' },
        { name: 'AI Ambassadors Certification', path: '/community-impact/ai-ambassadors/certification' },
        { name: 'Agriculture Consultant', path: '/community-impact/agriculture' },
        { name: 'Agriculture Certification', path: '/community-impact/agriculture/certification' },
        { name: 'Fishing Consultant', path: '/community-impact/fishing' },
        { name: 'Fishing Certification', path: '/community-impact/fishing/certification' },
        { name: 'Healthcare Navigator', path: '/community-impact/healthcare' },
        { name: 'Healthcare Certification', path: '/community-impact/healthcare/certification' },
        { name: 'Entrepreneurship Consultant', path: '/community-impact/entrepreneurship' },
        { name: 'Entrepreneurship Certification', path: '/community-impact/entrepreneurship/certification' },
        { name: 'Animal Husbandry Advisor', path: '/community-impact/animal-husbandry' },
      ],
    },
    {
      name: 'Research',
      shorthand: 'Research',
      dropdown: '__dynamic__' as any,
    },
    {
      name: 'Claude',
      shorthand: 'Claude',
      dropdown: [
        { name: 'Agent Builder', path: '/claude/agents' },
        { name: 'Use Claude',    path: '/playground'    },
        { name: 'Use Claude Together', path: '/playground/together' },
      ],
    },
    { name: 'Tutor', path: '/tutorials', shorthand: 'Tutor' },
    { name: 'Dashboard', path: '/dashboard', shorthand: 'Dashboard' },
    { name: 'About', path: '/about', shorthand: 'About' },
  ];

  const isActivePath = (path: string) => {
    if (path === '/home') {
      return location.pathname === '/' || location.pathname === '/home';
    }
    return location.pathname.startsWith(path);
  };

  // Shared style tokens — all items same size, vertically centered via items-stretch + h-full
  const navItemBase =
    'inline-flex items-center h-full px-2 text-sm font-semibold tracking-wide transition-colors whitespace-nowrap';
  const navItemActive =
    'text-purple-700 border-b-2 border-purple-600';
  const navItemIdle =
    'text-gray-600 hover:text-purple-700 border-b-2 border-transparent hover:border-purple-300';

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 gap-4">

          {/* Brand — driven by useBranding */}
          <div className="flex-shrink-0">
            <Link to="/home" className="flex items-center gap-1.5 group">
              {branding.logoPathLight ? (
                <img src={branding.logoPathLight} alt={branding.shortName} className="h-10 object-contain" />
              ) : (
                <>
                  <Sparkles size={20} className={`${branding.textColor} group-hover:opacity-80 transition-opacity`} />
                  <span className={`text-sm font-bold tracking-tight hidden lg:inline ${branding.textColor}`}>
                    {branding.shortName}
                  </span>
                </>
              )}
            </Link>
          </div>

          {/* Desktop nav — items-stretch so border-b-2 indicators sit flush at bar bottom */}
          <div className="hidden xl:flex items-stretch h-full flex-1 min-w-0">
            <div className="flex items-stretch gap-0.5">
              {navigationLinks.map((link) => {
                if (link.dropdown) {
                  const isAnyActive = (link.name === 'Research' ? researchPrograms : (link.dropdown as any[])).some((item: any) =>
                    isActivePath(item.path)
                  );
                  // Research gets teal; Claude gets violet
                  const isResearch = link.name === 'Research';
                  const isClaude   = link.name === 'Claude';
                  const activeStyle = isResearch
                    ? 'text-teal-700 border-b-2 border-teal-600'
                    : isClaude
                    ? 'text-violet-700 border-b-2 border-violet-600'
                    : navItemActive;
                  const idleStyle = isResearch
                    ? 'text-teal-600 hover:text-teal-700 border-b-2 border-transparent hover:border-teal-300'
                    : isClaude
                    ? 'text-violet-600 hover:text-violet-700 border-b-2 border-transparent hover:border-violet-300'
                    : navItemIdle;
                  const dropdownItems = link.name === 'Research'
                    ? researchPrograms
                    : (link.dropdown as {name:string;path:string}[]);
                  return (
                    <div
                      key={link.name}
                      className="relative flex items-stretch"
                      onMouseEnter={() => setOpenDropdown(link.name)}
                      onMouseLeave={() => setOpenDropdown(null)}
                    >
                      <button
                        className={classNames(
                          navItemBase,
                          'gap-1',
                          openDropdown === link.name || isAnyActive
                            ? activeStyle
                            : idleStyle
                        )}
                      >
                        {link.shorthand}
                        <svg
                          className="w-3 h-3 opacity-40"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {openDropdown === link.name && (
                        <div className="absolute top-full left-0 z-[200] w-full">
                          {/* Transparent bridge — keeps hover zone continuous across the gap */}
                          <div className="h-1 w-full" />
                          <div className="bg-white rounded-md shadow-lg ring-1 ring-black/5 py-1 min-w-[210px]">
                            {dropdownItems.map((item) => (
                              <Link
                                key={item.path}
                                to={item.path}
                                className={classNames(
                                  'block px-4 py-2 text-sm font-medium transition-colors',
                                  isActivePath(item.path)
                                    ? isResearch
                                      ? 'bg-teal-50 text-teal-700'
                                      : isClaude
                                      ? 'bg-violet-50 text-violet-700'
                                      : 'bg-purple-50 text-purple-700'
                                    : isResearch
                                      ? 'text-gray-700 hover:bg-teal-50 hover:text-teal-700'
                                      : isClaude
                                      ? 'text-gray-700 hover:bg-violet-50 hover:text-violet-700'
                                      : 'text-gray-700 hover:bg-purple-50 hover:text-purple-700'
                                )}
                              >
                                <span className="flex items-center gap-1.5">
                                  {item.name}
                                  {item.path === '/tech-skills' && (
                                    <span className="text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                                      ADVANCED
                                    </span>
                                  )}
                                </span>
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <Link
                    key={link.path}
                    to={link.path!}
                    className={classNames(
                      navItemBase,
                      isActivePath(link.path!) ? navItemActive : navItemIdle
                    )}
                  >
                    {link.shorthand}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Right-side user actions — same height/font as nav links */}
          <div className="hidden xl:flex items-stretch h-full flex-shrink-0 gap-0.5">
            {isLeaderOrAdmin && (
              <Link
                to="/admin/student-dashboard"
                className={classNames(
                  navItemBase,
                  'gap-1.5',
                  isActivePath('/admin/student-dashboard')
                    ? 'text-amber-700 border-b-2 border-amber-500'
                    : 'text-amber-600 hover:text-amber-700 border-b-2 border-transparent hover:border-amber-300'
                )}
              >
                <ShieldCheck size={14} />
                Admin
              </Link>
            )}

            <Link
              to="/profile"
              className={classNames(
                navItemBase,
                isActivePath('/profile') ? navItemActive : navItemIdle
              )}
            >
              Profile
            </Link>

            <button
              onClick={handleSignOut}
              className={classNames(
                navItemBase,
                'gap-1.5 text-gray-500 hover:text-red-600 border-b-2 border-transparent hover:border-red-300'
              )}
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>

          {/* Mobile hamburger */}
          <div className="xl:hidden flex items-center">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 rounded-md text-gray-500 hover:text-purple-700 hover:bg-purple-50 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-colors"
            >
              <span className="sr-only">{isOpen ? 'Close menu' : 'Open menu'}</span>
              {isOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isOpen && (
        <div className="xl:hidden border-t border-gray-100 bg-white">
          <div className="px-2 pt-2 pb-3 space-y-0.5">
            {navigationLinks.map((link) => {
              if (link.dropdown) {
                const isResearch = link.name === 'Research';
                const isClaude   = link.name === 'Claude';
                return (
                  <div key={link.name}>
                    <div className={classNames(
                      'px-3 py-1.5 text-xs font-bold uppercase tracking-wider',
                      isResearch ? 'text-teal-500' : isClaude ? 'text-violet-500' : 'text-gray-400'
                    )}>
                      {link.shorthand}
                    </div>
                    {(link.name === 'Research' ? researchPrograms : (link.dropdown as any[])).map((item) => (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={classNames(
                          'block px-5 py-2 rounded-md text-sm font-medium transition-colors',
                          isActivePath(item.path)
                            ? isResearch
                              ? 'bg-teal-50 text-teal-700'
                              : isClaude
                              ? 'bg-violet-50 text-violet-700'
                              : 'bg-purple-50 text-purple-700'
                            : isResearch
                              ? 'text-gray-600 hover:bg-teal-50 hover:text-teal-700'
                              : isClaude
                              ? 'text-gray-600 hover:bg-violet-50 hover:text-violet-700'
                              : 'text-gray-600 hover:bg-purple-50 hover:text-purple-700'
                        )}
                        onClick={() => setIsOpen(false)}
                      >
                        <span className="flex items-center gap-1.5">
                          {item.name}
                          {item.path === '/tech-skills' && (
                            <span className="text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                              ADVANCED
                            </span>
                          )}
                        </span>
                      </Link>
                    ))}
                  </div>
                );
              }
              return (
                <Link
                  key={link.path}
                  to={link.path!}
                  className={classNames(
                    'block px-3 py-2 rounded-md text-sm font-semibold transition-colors',
                    isActivePath(link.path!)
                      ? 'bg-purple-50 text-purple-700'
                      : 'text-gray-600 hover:bg-purple-50 hover:text-purple-700'
                  )}
                  onClick={() => setIsOpen(false)}
                >
                  {link.shorthand}
                </Link>
              );
            })}
          </div>

          <div className="border-t border-gray-100 px-2 pt-2 pb-3 space-y-0.5">
            {isLeaderOrAdmin && (
              <Link
                to="/admin/student-dashboard"
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold text-amber-600 hover:bg-amber-50 hover:text-amber-700 transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <ShieldCheck size={14} />
                Admin Dashboard
              </Link>
            )}
            <Link
              to="/profile"
              className="block px-3 py-2 rounded-md text-sm font-semibold text-gray-600 hover:bg-purple-50 hover:text-purple-700 transition-colors"
              onClick={() => setIsOpen(false)}
            >
              Profile
            </Link>
            <button
              onClick={() => { handleSignOut(); setIsOpen(false); }}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm font-semibold text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;