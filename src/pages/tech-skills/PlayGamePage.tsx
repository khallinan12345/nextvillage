// src/pages/tech-skills/PlayGamePage.tsx
//
// Read-only shareable link for a published Create Game game
// (src/pages/tech-skills/CreateGamePage.tsx). RLS on `student_games` scopes
// visibility to the game's own organization (or platform admin) — a
// `.single()` returning nothing means "not found or you don't have access,"
// which are indistinguishable from the outside by design.

import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import { supabase } from '../../lib/supabaseClient';
import { buildSafeHtml } from '../../lib/sandboxSafety';
import { ArrowLeft, Loader2, Gamepad2 } from 'lucide-react';

interface StudentGame {
  id: string;
  title: string;
  owner_name: string;
  html_content: string;
  created_at: string;
}

const PlayGamePage: React.FC = () => {
  const { gameId } = useParams<{ gameId: string }>();
  const [game, setGame] = useState<StudentGame | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!gameId) return;
    setLoading(true);
    supabase
      .from('student_games')
      .select('id, title, owner_name, html_content, created_at')
      .eq('id', gameId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setGame(data);
        else setNotFound(true);
        setLoading(false);
      });
  }, [gameId]);

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto">
        <Link to="/tech-skills/create-game" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4">
          <ArrowLeft size={15} /> Back to Create Game
        </Link>

        {loading ? (
          <div className="flex justify-center py-24"><Loader2 className="animate-spin text-gray-300" size={28} /></div>
        ) : notFound || !game ? (
          <div className="text-center py-24 text-gray-400">
            <Gamepad2 size={32} className="mx-auto mb-3 opacity-50" />
            <p>This game wasn't found, or you don't have access to it.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <p className="font-semibold text-gray-900">{game.title}</p>
              <p className="text-xs text-gray-400">Made by {game.owner_name}</p>
            </div>
            <iframe
              title={game.title}
              srcDoc={buildSafeHtml(game.html_content)}
              sandbox="allow-scripts"
              className="w-full border-0 h-[75vh]"
            />
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default PlayGamePage;
