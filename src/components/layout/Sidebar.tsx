import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import {
  Award, Brain, BarChart, BookOpen, GraduationCap,
  Code, Database, Layers, ImagePlus, Video, Mic, PenLine, Zap,
  Briefcase, Code2, Film, ImagePlus as ImagePlusIcon, Mic as MicIcon,
  Cpu, Wand2, ChevronDown, ChevronUp, ShieldCheck, Users, Sprout, Fish, Heart,
  GitBranch, PawPrint, FlaskConical, Tree, Leaf, Bot, Sparkles, Gamepad2
} from 'lucide-react';
import classNames from 'classnames';


interface NavItem {
  name: string;
  path: string;
  icon: React.ReactNode;
}

interface SectionConfig {
  id: string;
  label: string;
  emoji: string;
  fromGradient: string;
  toGradient: string;
  activeBg: string;
  activeText: string;
  sectionBg: string;
  headerText: string;
  items: NavItem[];
}

const Sidebar: React.FC = () => {
  const location = useLocation();
  const { user } = useAuth();
  const isLeaderOrAdmin = user?.role === 'site_leader' || user?.role === 'research_lead' || user?.role === 'platform_administrator';

  const mainNavigation: NavItem[] = [
    { name: 'Dashboard', path: '/dashboard', icon: <Database size={20} /> },
  ];

  const sections: SectionConfig[] = [
    {
      id: 'foundations',
      label: 'Foundations',
      emoji: '📐',
      fromGradient: 'from-amber-300',
      toGradient: 'to-orange-300',
      activeBg: 'bg-amber-100',
      activeText: 'text-amber-700',
      sectionBg: 'bg-amber-50/40',
      headerText: 'text-amber-600',
      items: [
        { name: 'English Skills', path: '/english-skills', icon: <BookOpen size={20} /> },
        { name: 'Math Skills',    path: '/math-skills',    icon: <BarChart size={20} /> },
        { name: 'Science Skills', path: '/science-skills', icon: <Brain size={20} />    },
      ],
    },
    {
      id: 'learning',
      label: 'Learning',
      emoji: '📚',
      fromGradient: 'from-blue-300',
      toGradient: 'to-cyan-300',
      activeBg: 'bg-blue-100',
      activeText: 'text-blue-700',
      sectionBg: 'bg-blue-50/40',
      headerText: 'text-blue-600',
      items: [
        { name: 'AI Learning',        path: '/learning/ai',     icon: <Brain size={20} />    },
        { name: 'Skills Development', path: '/learning/skills', icon: <BookOpen size={20} /> },
      ],
    },
    {
      id: 'certifications',
      label: 'Certifications',
      emoji: '🏆',
      fromGradient: 'from-purple-300',
      toGradient: 'to-pink-300',
      activeBg: 'bg-purple-100',
      activeText: 'text-purple-700',
      sectionBg: 'bg-purple-50/40',
      headerText: 'text-purple-600',
      items: [
        { name: 'AI Proficiency',  path: '/certifications/ai-proficiency',          icon: <Award size={20} />         },
        { name: 'AI Ready Skills', path: '/certifications/ai-ready-skills',         icon: <GraduationCap size={20} /> },
        { name: 'Vibe Coding',     path: '/certifications/vibe-coding',             icon: <Wand2 size={20} />         },
        { name: 'Web Dev',         path: '/certifications/web-dev-certification',   icon: <Code2 size={20} />         },
        { name: 'Full-Stack',      path: '/certifications/full-stack-certification',icon: <Database size={20} />      },
        { name: 'AI Workflow Dev', path: '/certifications/ai-workflow-dev',         icon: <Cpu size={20} />           },
        { name: 'AI for Business', path: '/certifications/ai-for-business',         icon: <Briefcase size={20} />     },
        { name: 'AI Voice',        path: '/certifications/ai-voice-creation',       icon: <MicIcon size={20} />       },
        { name: 'AI Image',        path: '/certifications/ai-image-creation-cert',  icon: <ImagePlusIcon size={20} /> },
        { name: 'AI Video',        path: '/certifications/ai-video-production',     icon: <Film size={20} />          },
        { name: 'AI Content',      path: '/certifications/ai-content-creation',     icon: <PenLine size={20} />       },
      ],
    },
    {
      id: 'tech-workshop',
      label: 'Tech Workshop',
      emoji: '🛠️',
      fromGradient: 'from-emerald-300',
      toGradient: 'to-teal-300',
      activeBg: 'bg-emerald-100',
      activeText: 'text-emerald-700',
      sectionBg: 'bg-emerald-50/40',
      headerText: 'text-emerald-600',
      items: [
        { name: 'Vibe Coding',         path: '/tech-skills/vibe-coding',            icon: <Wand2 size={20} />         },
        { name: 'Create Game',         path: '/tech-skills/create-game',            icon: <Gamepad2 size={20} />      },
        { name: 'Web Development',     path: '/tech-skills/web-development',         icon: <Code size={20} />          },
        { name: 'Full-Stack Dev',      path: '/tech-skills/full-stack-development',  icon: <Layers size={20} />        },
        { name: 'AI Image Creation',   path: '/tech-skills/ai-image-creation',       icon: <ImagePlus size={20} />     },
        { name: 'AI Voice Creation',   path: '/tech-skills/ai-voice-creation',       icon: <Mic size={20} />           },
        { name: 'AI Video Creation',   path: '/tech-skills/ai-video-creation',       icon: <Video size={20} />         },
        { name: 'AI Video Studio',     path: '/tech-skills/ai-video-studio',         icon: <Film size={20} />          },
        { name: 'AI Content Creation', path: '/tech-skills/ai-content-creation',     icon: <PenLine size={20} />       },
        { name: 'AI Workflow Dev',     path: '/tech-skills/ai-workflow-development', icon: <Zap size={20} />           },
        { name: 'AI for Business',     path: '/tech-skills/ai-for-business',         icon: <Briefcase size={20} />     },
        { name: 'Microsoft AI-900',    path: '/tech-skills/microsoft-ai900',         icon: <GraduationCap size={20} /> },
        { name: 'Microsoft DP-900',    path: '/tech-skills/microsoft-dp900',         icon: <Database size={20} />      },
        { name: 'Microsoft AB-730',    path: '/tech-skills/microsoft-ab730',         icon: <Briefcase size={20} />     },
        { name: 'GitHub GH-300',       path: '/tech-skills/github-gh300',            icon: <GitBranch size={20} />     },
        { name: 'Employable Tech Skills Prep',       path: '/tech-skills',            icon: <GitBranch size={20} />     },
      ],
    },
    {
      id: 'community-impact',
      label: 'Community Impact',
      emoji: '🌍',
      fromGradient: 'from-green-400',
      toGradient: 'to-teal-400',
      activeBg: 'bg-green-100',
      activeText: 'text-green-700',
      sectionBg: 'bg-green-50/40',
      headerText: 'text-green-700',
      items: [
        { name: 'AI Ambassadors',                  path: '/community-impact/ai-ambassadors',                icon: <Users size={20} />     },
        { name: 'AI Ambassadors Cert',             path: '/community-impact/ai-ambassadors/certification',  icon: <Award size={20} />     },
        { name: 'Agriculture Consultant',          path: '/community-impact/agriculture',                   icon: <Sprout size={20} />    },
        { name: 'Agriculture Cert',                path: '/community-impact/agriculture/certification',     icon: <Award size={20} />     },
        { name: 'Fishing Consultant',              path: '/community-impact/fishing',                       icon: <Fish size={20} />      },
        { name: 'Fishing Cert',                    path: '/community-impact/fishing/certification',         icon: <Award size={20} />     },
        { name: 'Healthcare Navigator',            path: '/community-impact/healthcare',                    icon: <Heart size={20} />     },
        { name: 'Healthcare Cert',                 path: '/community-impact/healthcare/certification',      icon: <Award size={20} />     },
        { name: 'Entrepreneurship Consultant',     path: '/community-impact/entrepreneurship',              icon: <Briefcase size={20} /> },
        { name: 'Entrepreneurship Cert',           path: '/community-impact/entrepreneurship/certification',icon: <Award size={20} />     },
        { name: 'Animal Husbandry Advisor',        path: '/community-impact/animal-husbandry',             icon: <PawPrint size={20} />  },
      ],
    },
    {
      id: 'research',
      label: 'Research',
      emoji: '🔬',
      fromGradient: 'from-teal-400',
      toGradient: 'to-cyan-400',
      activeBg: 'bg-teal-100',
      activeText: 'text-teal-700',
      sectionBg: 'bg-teal-50/40',
      headerText: 'text-teal-600',
      items: [], // populated dynamically from research_programs
    },
    {
      id: 'claude',
      label: 'Claude',
      emoji: '🤖',
      fromGradient: 'from-violet-300',
      toGradient: 'to-purple-300',
      activeBg: 'bg-violet-100',
      activeText: 'text-violet-700',
      sectionBg: 'bg-violet-50/40',
      headerText: 'text-violet-600',
      items: [
        { name: 'Agent Builder', path: '/claude/agents', icon: <Bot size={20} /> },
        { name: 'Use Claude',    path: '/playground',    icon: <Sparkles size={20} /> },
        { name: 'Use Claude Together', path: '/playground/together', icon: <Users size={20} /> },
      ],
    },
  ];

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  const getInitialOpen = (): Record<string, boolean> => {
    const state: Record<string, boolean> = {};
    sections.forEach(s => {
      state[s.id] = s.items.some(item => isActive(item.path));
    });
    return state;
  };

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(getInitialOpen);
  const [researchItems, setResearchItems] = useState<NavItem[]>([
    { name: 'AI Learning Lab', path: '/research/ai-learning-lab', icon: <FlaskConical size={20} /> },
    { name: 'IGiTREE',         path: '/research/igitree',         icon: <Leaf size={20} />         },
    { name: '+ Propose Research', path: '/research/new',          icon: <FlaskConical size={20} /> },
  ]);

  useEffect(() => {
    supabase
      .from('research_programs')
      .select('slug, title')
      .eq('status', 'active')
      .order('created_at')
      .then(({ data }) => {
        if (data?.length) {
          const dynamic: NavItem[] = data.map((p: any) => ({
            name: p.title,
            path: `/research/${p.slug}`,
            icon: <FlaskConical size={20} />,
          }));
          setResearchItems([...dynamic, { name: '+ Propose Research', path: '/research/new', icon: <FlaskConical size={20} /> }]);
        }
      });
  }, []);

  const toggle = (id: string) =>
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));

  const renderNavItem = (item: NavItem, activeBg: string, activeText: string) => {
    const active = isActive(item.path);
    return (
      <Link
        key={item.name}
        to={item.path}
        className={classNames(
          'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-semibold transition-colors',
          active
            ? `${activeBg} ${activeText}`
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        )}
      >
        <span className={classNames('flex-shrink-0', active ? activeText : 'text-gray-400')}>
          {item.icon}
        </span>
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="truncate">{item.name}</span>
          {item.path === '/tech-skills' && (
            <span className="flex-shrink-0 text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
              ADVANCED
            </span>
          )}
        </span>
      </Link>
    );
  };

  return (
    <div className="fixed inset-y-0 left-0 z-10 w-56 bg-white shadow-lg hidden md:flex">
      <div className="h-full w-full flex flex-col overflow-y-auto py-4">
        <nav className="px-3 space-y-1 pt-10">

          {mainNavigation.map(item => renderNavItem(item, 'bg-slate-100', 'text-slate-700'))}

          <div className="h-px bg-gray-100 my-3" />

          <div className="space-y-3">
            {sections.map(section => {
              const isOpen    = openSections[section.id] ?? false;
              const hasActive = section.items.some(item => isActive(item.path));

              return (
                <div key={section.id}>
                  <button
                    onClick={() => toggle(section.id)}
                    className="w-full flex items-center justify-between gap-1.5 group mb-1 px-1"
                  >
                    <span className={classNames(
                      'flex items-center gap-1 text-xs font-bold uppercase tracking-wider transition-colors',
                      section.headerText,
                    )}>
                      {section.emoji} {section.label}
                    </span>
                    {isOpen
                      ? <ChevronUp size={11} className={classNames('opacity-60', section.headerText)} />
                      : <ChevronDown size={11} className={classNames('opacity-60', section.headerText)} />}
                  </button>

                  {isOpen && (
                    <div className={`space-y-0.5 ${section.sectionBg} rounded-lg p-1.5`}>
                      {(section.id === 'research' ? researchItems : section.items).map(item =>
                        renderNavItem(item, section.activeBg, section.activeText)
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {isLeaderOrAdmin && (
            <>
              <div className="h-px bg-gray-100 my-3" />
              <Link
                to="/admin/student-dashboard"
                className={classNames(
                  'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-semibold transition-colors',
                  isActive('/admin/student-dashboard')
                    ? 'bg-amber-100 text-amber-700'
                    : 'text-amber-600 hover:bg-amber-50 hover:text-amber-700'
                )}
              >
                <span className={classNames(
                  'flex-shrink-0',
                  isActive('/admin/student-dashboard') ? 'text-amber-700' : 'text-amber-400'
                )}>
                  <ShieldCheck size={20} />
                </span>
                Admin
              </Link>
            </>
          )}

        </nav>
      </div>
    </div>
  );
};

export default Sidebar;