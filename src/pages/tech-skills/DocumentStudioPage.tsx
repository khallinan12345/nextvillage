// src/pages/tech-skills/DocumentStudioPage.tsx
//
// "Document Studio" — an Adobe InDesign-style page layout editor for
// articles and books. Users create pages with 1/2/3-column frames, drop
// in text and images, control typography, then export to PDF or save to
// Supabase. Team members can collaborate in real-time via Supabase
// Realtime broadcast channels (same org-scoped pattern as "Use Claude
// Together").
//
// Dependencies that may need installing:
//   npm i jspdf html2canvas
//   (jspdf is already used in PlaygroundTogetherPage)

import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { PidginTooltip } from '../../components/PidginTooltip';
import classNames from 'classnames';
import {
  FileText, Plus, Trash2, Download, Upload, Save, Layers,
  X, Check, AlertTriangle, FolderOpen, Clock, Image as ImageIcon,
  Type, AlignLeft, AlignCenter, AlignRight, Bold, Italic,
  ChevronLeft, ChevronRight, Columns, Copy, Eye, Edit3,
  Users, Wifi, WifiOff, Undo2, Redo2, Move, Maximize2,
  BookOpen, Loader2, GripVertical,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ColumnLayout = 1 | 2 | 3;
type TextAlign = 'left' | 'center' | 'right';
type BlockType = 'text' | 'image';

interface TextBlock {
  type: 'text';
  id: string;
  content: string;          // HTML content (contentEditable output)
  fontFamily: string;
  fontSize: number;         // px — block default
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  textAlign: TextAlign;
  color: string;
  lineHeight: number;       // multiplier, e.g. 1.6
}

interface ImageBlock {
  type: 'image';
  id: string;
  src: string;              // object URL or Supabase public URL
  alt: string;
  fit: 'cover' | 'contain';
  caption: string;
}

type ContentBlock = TextBlock | ImageBlock;

interface PageFrame {
  id: string;
  columnIndex: number;      // 0-based
  blocks: ContentBlock[];
}

interface DocPage {
  id: string;
  columns: ColumnLayout;
  frames: PageFrame[];      // one per column
  backgroundColor: string;
  marginPx: number;
  gapPx: number;
}

interface DocProject {
  id: string;
  name: string;
  pages: DocPage[];
  pageWidth: number;        // mm for PDF (default A4 = 210)
  pageHeight: number;       // mm for PDF (default A4 = 297)
  createdAt: string;
}

interface SavedProject {
  id: string;
  name: string;
  savedAt: string;
  projectData: Omit<DocProject, 'id'> | null;
  ownerId?: string | null;
}

// ─── Collaborator type for presence ───────────────────────────────────────────

interface Collaborator {
  userId: string;
  name: string;
  color: string;
  activePage: number;
}

const COLLAB_COLORS = ['#f97316','#22d3ee','#a78bfa','#34d399','#fb7185','#facc15','#60a5fa','#e879f9'];

// ─── Amazon KDP trim sizes (inches → mm for jsPDF) ───────────────────────────

const IN_TO_MM = 25.4;

interface TrimSize {
  label: string;
  widthIn: number;
  heightIn: number;
  gutterIn: number;     // inside margin (binding side) — assumes ~200pp
  marginTopIn: number;
  marginBottomIn: number;
  marginOuterIn: number;
  description: string;
}

const KDP_TRIM_SIZES: TrimSize[] = [
  { label: '5" × 8"',      widthIn: 5,    heightIn: 8,    gutterIn: 0.625, marginTopIn: 0.5,  marginBottomIn: 0.5,  marginOuterIn: 0.5,  description: 'Compact — fiction, poetry' },
  { label: '5.25" × 8"',   widthIn: 5.25, heightIn: 8,    gutterIn: 0.625, marginTopIn: 0.5,  marginBottomIn: 0.5,  marginOuterIn: 0.5,  description: 'Pocket paperback' },
  { label: '5.5" × 8.5"',  widthIn: 5.5,  heightIn: 8.5,  gutterIn: 0.625, marginTopIn: 0.5,  marginBottomIn: 0.5,  marginOuterIn: 0.5,  description: 'Popular — fiction, nonfiction' },
  { label: '6" × 9"',      widthIn: 6,    heightIn: 9,    gutterIn: 0.75,  marginTopIn: 0.625, marginBottomIn: 0.625, marginOuterIn: 0.5,  description: 'Standard — nonfiction, textbooks' },
  { label: '7" × 10"',     widthIn: 7,    heightIn: 10,   gutterIn: 0.875, marginTopIn: 0.75, marginBottomIn: 0.75, marginOuterIn: 0.625, description: 'Large — workbooks, illustrated' },
  { label: '8.5" × 11"',   widthIn: 8.5,  heightIn: 11,   gutterIn: 0.875, marginTopIn: 0.75, marginBottomIn: 0.75, marginOuterIn: 0.625, description: 'Full page — manuals, magazines' },
];

// ─── Fonts available ──────────────────────────────────────────────────────────

const FONT_FAMILIES = [
  'Inter, sans-serif',
  'Georgia, serif',
  'Times New Roman, serif',
  'Arial, sans-serif',
  'Verdana, sans-serif',
  'Courier New, monospace',
  'Trebuchet MS, sans-serif',
  'Palatino Linotype, serif',
];

const FONT_SIZES = [10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48, 56, 64, 72];

// ─── Utility ──────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 9);

const makeTextBlock = (overrides?: Partial<TextBlock>): TextBlock => ({
  type: 'text',
  id: uid(),
  content: '',
  fontFamily: 'Inter, sans-serif',
  fontSize: 14,
  fontWeight: 'normal',
  fontStyle: 'normal',
  textAlign: 'left',
  color: '#1e293b',
  lineHeight: 1.6,
  ...overrides,
});

const makeImageBlock = (src: string, alt = ''): ImageBlock => ({
  type: 'image',
  id: uid(),
  src,
  alt,
  fit: 'contain',
  caption: '',
});

const makePage = (columns: ColumnLayout = 1): DocPage => {
  const id = uid();
  const frames: PageFrame[] = Array.from({ length: columns }, (_, i) => ({
    id: uid(),
    columnIndex: i,
    blocks: [makeTextBlock()],
  }));
  return {
    id,
    columns,
    frames,
    backgroundColor: '#ffffff',
    marginPx: 40,
    gapPx: 24,
  };
};

// ─── Main Component ───────────────────────────────────────────────────────────

const DocumentStudioPage: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // ── Org resolution (same pattern as PlaygroundTogetherPage) ────────────────
  const [effectiveOrgId, setEffectiveOrgId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/home', { replace: true }); return; }
    supabase
      .rpc('get_my_effective_profile')
      .then(({ data }) => {
        const orgId = data?.[0]?.organization_id ?? null;
        setEffectiveOrgId(orgId);
        setAuthChecked(true);
        if (!orgId) navigate('/home', { replace: true });
      });
  }, [user, authLoading, navigate]);

  // ── Project state ───────────────────────────────────────────────────────────
  const [projectName, setProjectName] = useState('Untitled Document');
  const [pages, setPages] = useState<DocPage[]>([makePage(1)]);
  const [activePageIdx, setActivePageIdx] = useState(0);

  // ── Selection state ─────────────────────────────────────────────────────────
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  // ── View mode ───────────────────────────────────────────────────────────────
  const [studioView, setStudioView] = useState<'edit' | 'preview' | 'history'>('edit');

  // ── Save / load ─────────────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // ── PDF export ──────────────────────────────────────────────────────────────
  const [isExporting, setIsExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');
  const [trimSizeIdx, setTrimSizeIdx] = useState(3); // default: 6×9

  // ── Collaboration ───────────────────────────────────────────────────────────
  const [collabEnabled, setCollabEnabled] = useState(false);
  const [collabProjectId, setCollabProjectId] = useState<string | null>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Undo / redo ─────────────────────────────────────────────────────────────
  const [undoStack, setUndoStack] = useState<DocPage[][]>([]);
  const [redoStack, setRedoStack] = useState<DocPage[][]>([]);
  const pushUndo = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-30), pages]);
    setRedoStack([]);
  }, [pages]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    setRedoStack(prev => [pages, ...prev]);
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(s => s.slice(0, -1));
    setPages(prev);
    setCeVersion(v => v + 1);
  }, [undoStack, pages]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    setUndoStack(prev => [...prev, pages]);
    const next = redoStack[0];
    setRedoStack(s => s.slice(1));
    setPages(next);
    setCeVersion(v => v + 1);
  }, [redoStack, pages]);

  // ── Refs ────────────────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ceRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const inlineImgInputRef = useRef<HTMLInputElement>(null);

  // Version counter — bumped on undo/redo/load/collab to force content sync
  const [ceVersion, setCeVersion] = useState(0);

  // Sync React state → contentEditable innerHTML (runs on undo/redo/load/collab)
  useEffect(() => {
    for (const page of pages) {
      for (const frame of page.frames) {
        for (const block of frame.blocks) {
          if (block.type !== 'text') continue;
          const el = ceRefs.current.get(block.id);
          if (!el || el === document.activeElement) continue;
          if (el.innerHTML !== block.content) {
            el.innerHTML = block.content || '';
          }
        }
      }
    }
  }, [ceVersion]);

  // ── Rich-text helpers (execCommand on the active contentEditable) ──────────

  const execOnSelection = useCallback((cmd: string, value?: string) => {
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(cmd, false, value ?? '');
  }, []);

  const applyFontSizeToSelection = useCallback((sizePx: number) => {
    // execCommand fontSize only takes 1-7; workaround: apply size 7, then replace
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand('fontSize', false, '7');
    const el = ceRefs.current.get(selectedBlockId ?? '');
    if (!el) return;
    el.querySelectorAll('font[size="7"], span[style*="xxx-large"]').forEach(node => {
      const span = document.createElement('span');
      span.style.fontSize = `${sizePx}px`;
      span.innerHTML = node.innerHTML;
      node.parentNode?.replaceChild(span, node);
    });
    // Sync back
    const block = selectedBlockId;
    if (block) updateBlock(block, b => ({ ...b, content: el.innerHTML } as TextBlock));
  }, [selectedBlockId]);

  const applyFontFamilyToSelection = useCallback((family: string) => {
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand('fontName', false, family);
    const el = ceRefs.current.get(selectedBlockId ?? '');
    if (el && selectedBlockId) updateBlock(selectedBlockId, b => ({ ...b, content: el.innerHTML } as TextBlock));
  }, [selectedBlockId]);

  const applyColorToSelection = useCallback((color: string) => {
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand('foreColor', false, color);
    const el = ceRefs.current.get(selectedBlockId ?? '');
    if (el && selectedBlockId) updateBlock(selectedBlockId, b => ({ ...b, content: el.innerHTML } as TextBlock));
  }, [selectedBlockId]);

  const hasSelection = useCallback(() => {
    const sel = window.getSelection();
    return sel && !sel.isCollapsed;
  }, []);

  // Insert an inline image at the cursor inside a contentEditable
  // Upload a file to Supabase storage and return the public URL (or fallback to object URL)
  const uploadImageFile = useCallback(async (file: File): Promise<string> => {
    if (user?.id) {
      const ext = file.name.split('.').pop() || 'png';
      const path = `doc-studio/${user.id}/${uid()}.${ext}`;
      const { error } = await supabase.storage
        .from('together-assets')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('together-assets').getPublicUrl(path);
        return publicUrl;
      }
    }
    return URL.createObjectURL(file);
  }, [user?.id]);

  // Insert an image inline into a text block's contentEditable
  // If targetBlockId is given, use that block; otherwise use selectedBlockId.
  // If the block has no cursor, the image appends at the end.
  const insertInlineImage = useCallback(async (file: File, targetBlockId?: string) => {
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'].includes(file.type)) {
      alert('Please choose a PNG, JPEG, GIF, or WEBP image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('Image is too large — please choose one under 10 MB.');
      return;
    }

    const blockId = targetBlockId || selectedBlockId;
    if (!blockId) return;
    const el = ceRefs.current.get(blockId);
    if (!el) return;

    pushUndo();
    const src = await uploadImageFile(file);

    // Build the image HTML
    const imgHtml = `<img src="${src}" alt="${file.name}" style="max-width:100%;height:auto;border-radius:4px;margin:8px 0;display:block;cursor:grab;" />`;

    // Focus the contentEditable
    el.focus();

    // Try to insert at cursor position using execCommand
    const sel = window.getSelection();
    const hasActiveCursor = sel && sel.rangeCount > 0 && el.contains(sel.anchorNode);

    if (hasActiveCursor) {
      document.execCommand('insertHTML', false, imgHtml);
    } else {
      // No cursor in this block — append at end
      el.innerHTML += imgHtml;
    }

    // Sync back to state
    updateBlock(blockId, b => ({ ...b, content: el.innerHTML } as TextBlock));
  }, [selectedBlockId, uploadImageFile, pushUndo]);

  // Find the first text block in a frame, or create one if none exist
  const getOrCreateTextBlockInFrame = useCallback((frameId: string): string | null => {
    for (const page of pages) {
      for (const frame of page.frames) {
        if (frame.id !== frameId) continue;
        const textBlock = frame.blocks.find(b => b.type === 'text');
        if (textBlock) return textBlock.id;
        // No text block — create one
        const newBlock = makeTextBlock();
        const updated = pages.map(p => ({
          ...p,
          frames: p.frames.map(f =>
            f.id === frameId ? { ...f, blocks: [newBlock, ...f.blocks] } : f
          ),
        }));
        setPages(updated);
        broadcastPageUpdate(updated);
        return newBlock.id;
      }
    }
    return null;
  }, [pages, broadcastPageUpdate]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const activePage = pages[activePageIdx] ?? pages[0];
  const selectedBlock = useMemo(() => {
    if (!selectedBlockId) return null;
    for (const frame of (activePage?.frames ?? [])) {
      const block = frame.blocks.find(b => b.id === selectedBlockId);
      if (block) return block;
    }
    return null;
  }, [activePage, selectedBlockId]);

  // ── Load projects on mount ────────────────────────────────────────────────
  useEffect(() => { if (authChecked && effectiveOrgId) loadProjects(); }, [authChecked, effectiveOrgId]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo(); else handleUndo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSaveProject();
      }
      if (e.key === 'Delete' && selectedBlockId) {
        const tag = (document.activeElement as HTMLElement)?.tagName;
        if (tag === 'TEXTAREA' || tag === 'INPUT') return; // let normal editing work
        e.preventDefault();
        removeBlock(selectedBlockId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo, selectedBlockId]);

  // ── Collaboration: broadcast page changes ─────────────────────────────────
  useEffect(() => {
    if (!collabEnabled || !collabProjectId || !user?.id) return;

    const channel = supabase.channel(`doc-studio-${collabProjectId}`, {
      config: { broadcast: { self: false }, presence: { key: user.id } },
    });

    channel
      .on('broadcast', { event: 'page-update' }, ({ payload }) => {
        if (payload.userId !== user.id) {
          setPages(payload.pages);
          setCeVersion(v => v + 1);
        }
      })
      .on('broadcast', { event: 'cursor-move' }, ({ payload }) => {
        setCollaborators(prev => {
          const existing = prev.find(c => c.userId === payload.userId);
          if (existing) {
            return prev.map(c => c.userId === payload.userId
              ? { ...c, activePage: payload.activePage } : c);
          }
          return [...prev, {
            userId: payload.userId,
            name: payload.name,
            color: COLLAB_COLORS[prev.length % COLLAB_COLORS.length],
            activePage: payload.activePage,
          }];
        });
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        setCollaborators(prev => prev.filter(c => c.userId !== key));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            userId: user.id,
            name: user.name,
            joinedAt: new Date().toISOString(),
          });
        }
      });

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      setCollaborators([]);
    };
  }, [collabEnabled, collabProjectId, user?.id]);

  // Broadcast page changes to collaborators
  const broadcastPageUpdate = useCallback((updatedPages: DocPage[]) => {
    if (channelRef.current && collabEnabled && user?.id) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'page-update',
        payload: { userId: user.id, pages: updatedPages },
      });
    }
  }, [collabEnabled, user?.id]);

  // Broadcast active page index
  useEffect(() => {
    if (channelRef.current && collabEnabled && user?.id) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'cursor-move',
        payload: { userId: user.id, name: user.name, activePage: activePageIdx },
      });
    }
  }, [activePageIdx, collabEnabled, user?.id]);

  // ── Page operations ───────────────────────────────────────────────────────

  const addPage = (columns: ColumnLayout = 1) => {
    pushUndo();
    const newPage = makePage(columns);
    const updated = [...pages, newPage];
    setPages(updated);
    setActivePageIdx(updated.length - 1);
    broadcastPageUpdate(updated);
  };

  const removePage = (idx: number) => {
    if (pages.length <= 1) return;
    pushUndo();
    const updated = pages.filter((_, i) => i !== idx);
    setPages(updated);
    if (activePageIdx >= updated.length) setActivePageIdx(updated.length - 1);
    broadcastPageUpdate(updated);
  };

  const duplicatePage = (idx: number) => {
    pushUndo();
    const original = pages[idx];
    const clone: DocPage = JSON.parse(JSON.stringify(original));
    clone.id = uid();
    clone.frames.forEach(f => { f.id = uid(); f.blocks.forEach(b => { b.id = uid(); }); });
    const updated = [...pages.slice(0, idx + 1), clone, ...pages.slice(idx + 1)];
    setPages(updated);
    setActivePageIdx(idx + 1);
    broadcastPageUpdate(updated);
  };

  const changePageColumns = (pageId: string, columns: ColumnLayout) => {
    pushUndo();
    const updated = pages.map(p => {
      if (p.id !== pageId) return p;
      // Gather all existing blocks
      const allBlocks = p.frames.flatMap(f => f.blocks);
      // Redistribute into new column count
      const frames: PageFrame[] = Array.from({ length: columns }, (_, i) => ({
        id: uid(),
        columnIndex: i,
        blocks: [] as ContentBlock[],
      }));
      allBlocks.forEach((block, i) => {
        frames[i % columns].blocks.push(block);
      });
      // Ensure each frame has at least one text block
      frames.forEach(f => {
        if (f.blocks.length === 0) f.blocks.push(makeTextBlock());
      });
      return { ...p, columns, frames };
    });
    setPages(updated);
    broadcastPageUpdate(updated);
  };

  // ── Block operations ──────────────────────────────────────────────────────

  const updateBlock = (blockId: string, updater: (b: ContentBlock) => ContentBlock) => {
    const updated = pages.map(p => ({
      ...p,
      frames: p.frames.map(f => ({
        ...f,
        blocks: f.blocks.map(b => b.id === blockId ? updater(b) : b),
      })),
    }));
    setPages(updated);
    broadcastPageUpdate(updated);
  };

  const updateBlockWithUndo = (blockId: string, updater: (b: ContentBlock) => ContentBlock) => {
    pushUndo();
    updateBlock(blockId, updater);
  };

  const addTextBlock = (frameId: string) => {
    pushUndo();
    const block = makeTextBlock();
    const updated = pages.map(p => ({
      ...p,
      frames: p.frames.map(f =>
        f.id === frameId ? { ...f, blocks: [...f.blocks, block] } : f
      ),
    }));
    setPages(updated);
    setSelectedBlockId(block.id);
    broadcastPageUpdate(updated);
  };

  const addImageToFrame = (frameId: string, src: string, alt = '') => {
    pushUndo();
    const block = makeImageBlock(src, alt);
    const updated = pages.map(p => ({
      ...p,
      frames: p.frames.map(f =>
        f.id === frameId ? { ...f, blocks: [...f.blocks, block] } : f
      ),
    }));
    setPages(updated);
    setSelectedBlockId(block.id);
    broadcastPageUpdate(updated);
  };

  const removeBlock = (blockId: string) => {
    pushUndo();
    const updated = pages.map(p => ({
      ...p,
      frames: p.frames.map(f => ({
        ...f,
        blocks: f.blocks.filter(b => b.id !== blockId),
      })),
    }));
    setPages(updated);
    if (selectedBlockId === blockId) setSelectedBlockId(null);
    broadcastPageUpdate(updated);
  };

  const moveBlockInFrame = (frameId: string, blockId: string, direction: -1 | 1) => {
    pushUndo();
    const updated = pages.map(p => ({
      ...p,
      frames: p.frames.map(f => {
        if (f.id !== frameId) return f;
        const idx = f.blocks.findIndex(b => b.id === blockId);
        if (idx < 0) return f;
        const newIdx = idx + direction;
        if (newIdx < 0 || newIdx >= f.blocks.length) return f;
        const blocks = [...f.blocks];
        [blocks[idx], blocks[newIdx]] = [blocks[newIdx], blocks[idx]];
        return { ...f, blocks };
      }),
    }));
    setPages(updated);
    broadcastPageUpdate(updated);
  };

  // ── Image upload (inserts inline into a text block) ────────────────────────

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, frameId: string) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user?.id) return;

    // Find the target text block: use selectedBlockId if it's in this frame, else first text block
    let targetId = selectedBlockId;
    const frameBlocks = pages.flatMap(p => p.frames).find(f => f.id === frameId)?.blocks ?? [];
    const selectedInFrame = targetId && frameBlocks.some(b => b.id === targetId && b.type === 'text');
    if (!selectedInFrame) {
      targetId = getOrCreateTextBlockInFrame(frameId);
    }
    if (!targetId) return;

    await insertInlineImage(file, targetId);
  };

  // ── Drag-and-drop image onto frame (inserts inline) ───────────────────────

  const handleFrameDrop = async (e: React.DragEvent, frameId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;

    let targetId = selectedBlockId;
    const frameBlocks = pages.flatMap(p => p.frames).find(f => f.id === frameId)?.blocks ?? [];
    const selectedInFrame = targetId && frameBlocks.some(b => b.id === targetId && b.type === 'text');
    if (!selectedInFrame) {
      targetId = getOrCreateTextBlockInFrame(frameId);
    }
    if (!targetId) return;

    for (const file of files) {
      await insertInlineImage(file, targetId);
    }
  };

  // ── Save project ──────────────────────────────────────────────────────────

  const handleSaveProject = async () => {
    if (!user?.id || !effectiveOrgId) return;
    setIsSaving(true);
    setSaveMsg('Saving…');
    try {
      // Sync any focused contentEditable before saving
      ceRefs.current.forEach((el, blockId) => {
        updateBlock(blockId, b => b.type === 'text' ? { ...b, content: el.innerHTML } as TextBlock : b);
      });

      const projectData = { name: projectName, pages, pageWidth: 210, pageHeight: 297, createdAt: new Date().toISOString() };
      const projectId = collabProjectId || uid();

      if (collabProjectId) {
        const { error } = await supabase
          .from('document_studio_projects')
          .update({ name: projectName.trim() || 'Untitled', project_data: projectData })
          .eq('id', collabProjectId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('document_studio_projects')
          .insert({
            id:              projectId,
            user_id:         user.id,
            organization_id: effectiveOrgId,
            name:            projectName.trim() || 'Untitled',
            project_data:    projectData,
            created_at:      new Date().toISOString(),
          });
        if (error) throw error;
        setCollabProjectId(projectId);
      }

      setSaveMsg('Saved!');
      await loadProjects();
      await new Promise(r => setTimeout(r, 2000));
    } catch (err: any) {
      console.error('[DocStudio] Save failed:', err);
      setSaveMsg('Error: ' + (err.message ?? 'Save failed'));
      await new Promise(r => setTimeout(r, 3000));
    } finally {
      setIsSaving(false);
      setSaveMsg('');
    }
  };

  // ── Load projects ─────────────────────────────────────────────────────────

  const loadProjects = async () => {
    if (!user?.id || !effectiveOrgId) return;
    setLoadingProjects(true);
    try {
      // RLS filters to same org automatically — no need to pass org_id here
      const { data, error } = await supabase
        .from('document_studio_projects')
        .select('id, name, created_at, project_data, user_id')
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) console.warn('[DocStudio] loadProjects error:', error.message);
      if (data) {
        setSavedProjects(data.map((d: any) => ({
          id:          d.id,
          name:        d.name,
          savedAt:     d.created_at,
          projectData: d.project_data ?? null,
          ownerId:     d.user_id ?? null,
        })));
      }
    } catch (e) { console.error('[DocStudio] loadProjects exception:', e); }
    setLoadingProjects(false);
  };

  const handleLoadProject = (project: SavedProject) => {
    try {
      const pd = project.projectData;
      if (!pd || !pd.pages) { alert('Project data is corrupt or empty.'); return; }
      setProjectName(pd.name || project.name || 'Untitled');
      setPages(pd.pages);
      setActivePageIdx(0);
      setCollabProjectId(project.id);
      setStudioView('edit');
      setSelectedBlockId(null);
      setUndoStack([]);
      setRedoStack([]);
      setCeVersion(v => v + 1);
    } catch {
      alert('Could not load project — data may be corrupt.');
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!window.confirm('Delete this project? This cannot be undone.')) return;
    await supabase.from('document_studio_projects').delete().eq('id', projectId);
    setSavedProjects(prev => prev.filter(p => p.id !== projectId));
    if (collabProjectId === projectId) {
      setCollabProjectId(null);
      setPages([makePage(1)]);
      setProjectName('Untitled Document');
    }
  };

  // ── PDF export ────────────────────────────────────────────────────────────

  const handleExportPDF = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportMsg('Preparing PDF…');

    try {
      const jsPDFModule = await import('jspdf').catch(() => null);
      if (!jsPDFModule) {
        alert('PDF generation is not available. Please install jspdf: npm i jspdf');
        return;
      }
      const { jsPDF } = jsPDFModule;

      // ── Amazon KDP trim dimensions ──────────────────────────────────────
      const trim = KDP_TRIM_SIZES[trimSizeIdx];
      const pageW = trim.widthIn * IN_TO_MM;
      const pageH = trim.heightIn * IN_TO_MM;
      const gutterMm = trim.gutterIn * IN_TO_MM;
      const marginTopMm = trim.marginTopIn * IN_TO_MM;
      const marginBotMm = trim.marginBottomIn * IN_TO_MM;
      const marginOutMm = trim.marginOuterIn * IN_TO_MM;
      const colGapMm = 5; // gap between columns in multi-col layouts

      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [pageW, pageH],
      });

      // Track actual PDF page count (may exceed pages.length when content overflows)
      let pdfPageNum = 0;

      // Helper: add a new PDF page, stamp page number on current, return fresh Y
      const addPdfPage = () => {
        // Stamp page number on the page we're leaving
        doc.setFont('times', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(80, 80, 80);
        doc.text(String(pdfPageNum + 1), pageW / 2, pageH - marginBotMm / 2, { align: 'center' });

        doc.addPage([pageW, pageH]);
        pdfPageNum++;
        return marginTopMm;
      };

      // Margin helpers — alternate gutter side per PDF page
      const getMarginsForPage = (num: number) => {
        const isRight = (num + 1) % 2 === 1; // 1-indexed odd = right-hand
        const mL = isRight ? gutterMm : marginOutMm;
        const mR = isRight ? marginOutMm : gutterMm;
        return { marginLeft: mL, marginRight: mR, contentWidth: pageW - mL - mR };
      };

      for (let pIdx = 0; pIdx < pages.length; pIdx++) {
        if (pIdx > 0) {
          // Stamp page number before moving on
          doc.setFont('times', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(80, 80, 80);
          doc.text(String(pdfPageNum + 1), pageW / 2, pageH - marginBotMm / 2, { align: 'center' });

          doc.addPage([pageW, pageH]);
          pdfPageNum++;
        }
        const page = pages[pIdx];

        let { marginLeft, contentWidth } = getMarginsForPage(pdfPageNum);
        const colWidth = (contentWidth - (page.columns - 1) * colGapMm) / page.columns;

        // ── Render each column / frame ────────────────────────────────────
        for (let fIdx = 0; fIdx < page.frames.length; fIdx++) {
          const frame = page.frames[fIdx];
          let curColX = marginLeft + fIdx * (colWidth + colGapMm);
          let colY = marginTopMm;

          for (const block of frame.blocks) {
            if (block.type === 'text' && block.content.trim()) {
              // Parse HTML content: extract text and inline images
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = block.content;

              // Collect inline images for separate rendering after text
              const inlineImgs: string[] = [];
              tempDiv.querySelectorAll('img').forEach(img => {
                inlineImgs.push(img.getAttribute('src') || '');
                img.replaceWith('\n'); // replace img with line break in text
              });

              // Convert HTML to plain text preserving line breaks
              const plainText = tempDiv.innerText || tempDiv.textContent || '';

              if (plainText.trim()) {
                const fontSize = Math.max(8, Math.min(block.fontSize * 0.75, 36));
                doc.setFontSize(fontSize);

                const isBold = block.fontWeight === 'bold';
                const isItalic = block.fontStyle === 'italic';
                let style = 'normal';
                if (isBold && isItalic) style = 'bolditalic';
                else if (isBold) style = 'bold';
                else if (isItalic) style = 'italic';

                const family = block.fontFamily.includes('serif') && !block.fontFamily.includes('sans')
                  ? 'times' : block.fontFamily.includes('monospace') || block.fontFamily.includes('Courier')
                  ? 'courier' : 'helvetica';

                doc.setFont(family, style);

                const hex = block.color.replace('#', '');
                const r = parseInt(hex.substring(0, 2), 16);
                const g = parseInt(hex.substring(2, 4), 16);
                const b = parseInt(hex.substring(4, 6), 16);
                doc.setTextColor(r, g, b);

                const lineH = fontSize * 0.3528 * (block.lineHeight ?? 1.6);
                const lines: string[] = doc.splitTextToSize(plainText, colWidth);

                for (const line of lines) {
                  if (colY + lineH > pageH - marginBotMm) {
                    colY = addPdfPage();
                    const m = getMarginsForPage(pdfPageNum);
                    curColX = m.marginLeft + fIdx * (colWidth + colGapMm);
                    doc.setFont(family, style);
                    doc.setFontSize(fontSize);
                    doc.setTextColor(r, g, b);
                  }

                  let textX = curColX;
                  if (block.textAlign === 'center') textX = curColX + colWidth / 2;
                  else if (block.textAlign === 'right') textX = curColX + colWidth;

                  doc.text(line, textX, colY, {
                    align: block.textAlign === 'center' ? 'center'
                      : block.textAlign === 'right' ? 'right' : 'left',
                  });
                  colY += lineH;
                }
                colY += 3;
              }

              // Render inline images found in the HTML
              for (const imgSrc of inlineImgs) {
                if (!imgSrc) continue;
                try {
                  const res = await fetch(imgSrc);
                  const blob = await res.blob();
                  const base64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.onerror = () => reject(new Error('read failed'));
                    reader.readAsDataURL(blob);
                  });
                  const format = blob.type.includes('png') ? 'PNG' : 'JPEG';
                  const props = doc.getImageProperties(base64);
                  const ratio = props.width / props.height;
                  let dispWidth = colWidth * 0.8;
                  let dispHeight = dispWidth / ratio;
                  const contentH = pageH - marginTopMm - marginBotMm;
                  if (dispHeight > contentH * 0.4) { dispHeight = contentH * 0.4; dispWidth = dispHeight * ratio; }
                  if (colY + dispHeight > pageH - marginBotMm) {
                    colY = addPdfPage();
                    const m = getMarginsForPage(pdfPageNum);
                    curColX = m.marginLeft + fIdx * (colWidth + colGapMm);
                  }
                  doc.addImage(base64, format, curColX + (colWidth - dispWidth) / 2, colY, dispWidth, dispHeight);
                  colY += dispHeight + 3;
                } catch { /* skip failed inline images */ }
              }

            } else if (block.type === 'image') {
              try {
                setExportMsg(`Embedding image on page ${pdfPageNum + 1}…`);
                const res = await fetch(block.src);
                const blob = await res.blob();
                const base64 = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result as string);
                  reader.onerror = () => reject(new Error('read failed'));
                  reader.readAsDataURL(blob);
                });
                const format = blob.type.includes('png') ? 'PNG' : 'JPEG';
                const props = doc.getImageProperties(base64);
                const ratio = props.width / props.height;
                let dispWidth = colWidth;
                let dispHeight = dispWidth / ratio;
                const contentH = pageH - marginTopMm - marginBotMm;
                const maxImgH = contentH * 0.6;
                if (dispHeight > maxImgH) { dispHeight = maxImgH; dispWidth = dispHeight * ratio; }

                // Overflow → new page for image
                if (colY + dispHeight > pageH - marginBotMm) {
                  colY = addPdfPage();
                  const m = getMarginsForPage(pdfPageNum);
                  curColX = m.marginLeft + fIdx * (colWidth + colGapMm);
                }

                doc.addImage(base64, format, curColX + (colWidth - dispWidth) / 2, colY, dispWidth, dispHeight);
                colY += dispHeight + 2;

                if (block.caption) {
                  doc.setFontSize(9);
                  doc.setFont('times', 'italic');
                  doc.setTextColor(100, 100, 100);
                  for (const line of doc.splitTextToSize(block.caption, colWidth)) {
                    if (colY + 4 > pageH - marginBotMm) {
                      colY = addPdfPage();
                      const m = getMarginsForPage(pdfPageNum);
                      curColX = m.marginLeft + fIdx * (colWidth + colGapMm);
                      doc.setFontSize(9);
                      doc.setFont('times', 'italic');
                      doc.setTextColor(100, 100, 100);
                    }
                    doc.text(line, curColX, colY); colY += 4;
                  }
                }
                colY += 3;
              } catch {
                // Skip images that fail to load
              }
            }
          }
        }
      }

      // Stamp page number on the final page
      doc.setFont('times', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(80, 80, 80);
      doc.text(String(pdfPageNum + 1), pageW / 2, pageH - marginBotMm / 2, { align: 'center' });

      const safeName = projectName.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'document';
      doc.save(`${safeName}.pdf`);
      setExportMsg('PDF downloaded!');
      await new Promise(r => setTimeout(r, 2000));
    } catch (err: any) {
      console.error('[DocStudio] PDF export error:', err);
      setExportMsg('Export failed: ' + (err.message ?? 'unknown error'));
      await new Promise(r => setTimeout(r, 3000));
    } finally {
      setIsExporting(false);
      setExportMsg('');
    }
  };

  // ── Enable / disable collaboration ────────────────────────────────────────

  const toggleCollab = async () => {
    if (!collabProjectId) {
      // Save first
      await handleSaveProject();
    }
    setCollabEnabled(prev => !prev);
  };

  // ── PX_PER_PAGE for the canvas zoom ───────────────────────────────────────
  const PAGE_CANVAS_WIDTH = 680;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <style>{`
        .doc-studio-root {
          font-family: 'Inter', system-ui, sans-serif;
        }
        .page-canvas {
          background: white;
          box-shadow: 0 4px 24px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,0,0,0.08);
          transition: transform 0.2s ease;
        }
        .frame-column {
          min-height: 200px;
          transition: background-color 0.15s ease;
        }
        .frame-column.drag-over {
          background-color: rgba(59, 130, 246, 0.08) !important;
          outline: 2px dashed #3b82f6;
          outline-offset: -2px;
        }
        .block-wrapper {
          position: relative;
          transition: outline 0.1s ease;
        }
        .block-wrapper:hover {
          outline: 1px solid #93c5fd;
        }
        .block-wrapper.selected {
          outline: 2px solid #3b82f6;
        }
        .block-wrapper .block-toolbar {
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.15s ease;
        }
        .block-wrapper:hover .block-toolbar,
        .block-wrapper.selected .block-toolbar {
          opacity: 1;
          pointer-events: auto;
        }
        .text-editing {
          outline: 2px solid #8b5cf6 !important;
          background: rgba(139, 92, 246, 0.04);
        }
        .rich-text-block:focus {
          outline: 2px solid #8b5cf6;
          background: rgba(139, 92, 246, 0.04);
        }
        .rich-text-block:empty::before {
          content: attr(data-placeholder);
          color: #94a3b8;
          font-style: italic;
          pointer-events: none;
        }
        .rich-text-block img {
          max-width: 100%;
          height: auto;
          border-radius: 4px;
          margin: 8px 0;
          display: block;
          cursor: grab;
          user-select: all;
          transition: outline 0.15s ease, box-shadow 0.15s ease;
        }
        .rich-text-block img:hover {
          outline: 2px solid #3b82f6;
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.25);
        }
        .rich-text-block img::selection {
          background: rgba(139, 92, 246, 0.3);
        }
        .rich-text-block img:active {
          cursor: grabbing;
        }
        .page-thumb {
          transition: all 0.15s ease;
        }
        .page-thumb:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        }
        .page-thumb.active {
          outline: 2px solid #8b5cf6;
        }
      `}</style>

      <div className="doc-studio-root fixed top-14 left-0 right-0 bottom-0 flex flex-col bg-slate-950 overflow-hidden">

        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3 bg-slate-900 border-b border-slate-700/60 shrink-0 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">Document Studio</h1>
              <p className="text-slate-400 text-xs">Layout · Design · Collaborate · Publish</p>
              <div className="mt-1">
                <PidginTooltip
                  originalText="Layout · Design · Collaborate · Publish"
                  hintText="Tap here to translate this page subtitle into Nigerian Pidgin."
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View toggle */}
            <div className="flex bg-slate-800 rounded-lg p-0.5 border border-slate-700">
              {(['edit', 'preview', 'history'] as const).map(v => (
                <button key={v} onClick={() => { setStudioView(v); if (v === 'history') loadProjects(); }}
                  className={classNames('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors', studioView === v ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200')}>
                  {v === 'edit' ? <><Edit3 size={12} /> Edit</> : v === 'preview' ? <><Eye size={12} /> Preview</> : <><Clock size={12} /> Projects</>}
                </button>
              ))}
            </div>
            {/* Project name */}
            <input
              type="text" value={projectName} onChange={e => setProjectName(e.target.value)}
              className="bg-slate-800 border border-slate-600 text-slate-200 text-xs rounded-lg px-3 py-1.5 w-40 focus:outline-none focus:border-violet-400 placeholder-slate-500"
              placeholder="Document name…"
            />
            {/* Undo / Redo */}
            <div className="flex gap-0.5">
              <button onClick={handleUndo} disabled={undoStack.length === 0} title="Undo (Ctrl+Z)"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 transition-colors">
                <Undo2 size={14} />
              </button>
              <button onClick={handleRedo} disabled={redoStack.length === 0} title="Redo (Ctrl+Shift+Z)"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 transition-colors">
                <Redo2 size={14} />
              </button>
            </div>
            {/* Save */}
            <button onClick={handleSaveProject} disabled={isSaving}
              className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors shrink-0">
              {isSaving
                ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {saveMsg}</>
                : <><Save size={13} /> Save</>}
            </button>
            {/* Book trim size */}
            <select
              value={trimSizeIdx}
              onChange={e => setTrimSizeIdx(Number(e.target.value))}
              title="Amazon KDP trim size"
              className="bg-slate-800 border border-slate-600 text-slate-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400">
              {KDP_TRIM_SIZES.map((t, i) => (
                <option key={i} value={i}>{t.label} — {t.description}</option>
              ))}
            </select>
            {/* Export PDF */}
            <button onClick={handleExportPDF} disabled={isExporting}
              className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors shrink-0">
              {isExporting
                ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {exportMsg}</>
                : <><Download size={13} /> Export PDF</>}
            </button>
            {/* Collab toggle */}
            <button onClick={toggleCollab}
              className={classNames('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors shrink-0',
                collabEnabled ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300')}>
              {collabEnabled ? <><Wifi size={13} /> Live</> : <><Users size={13} /> Collaborate</>}
            </button>
            {/* Collaborator avatars */}
            {collaborators.length > 0 && (
              <div className="flex -space-x-1">
                {collaborators.map(c => (
                  <div key={c.userId} title={c.name}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-slate-900"
                    style={{ backgroundColor: c.color }}>
                    {c.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── History / Projects view ─────────────────────────────────────── */}
        {studioView === 'history' && (
          <div className="flex-1 overflow-y-auto p-6 bg-slate-950">
            <h2 className="text-white font-bold text-base mb-4 flex items-center gap-2">
              <FolderOpen size={18} className="text-violet-400" /> Saved Documents
            </h2>
            {loadingProjects ? (
              <div className="flex justify-center py-16">
                <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : savedProjects.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                <Save size={40} className="mx-auto mb-3 opacity-30" />
                <p>No saved documents yet.</p>
                <p className="text-xs mt-1">Create something in the editor and hit Save.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {savedProjects.map(p => (
                  <div key={p.id}
                    className="group bg-slate-900 border border-slate-700/60 rounded-xl overflow-hidden cursor-pointer hover:border-violet-500/60 transition-colors">
                    <div className="relative bg-slate-800" style={{ aspectRatio: '3/4' }}
                      onClick={() => handleLoadProject(p)}>
                      <div className="w-full h-full flex items-center justify-center">
                        <FileText size={28} className="text-slate-600" />
                      </div>
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-violet-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                          Open
                        </div>
                      </div>
                    </div>
                    <div className="px-3 py-2 flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-200 font-semibold truncate">{p.name}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {new Date(p.savedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                          {p.ownerId && p.ownerId !== user?.id && (
                            <span className="ml-1.5 px-1.5 py-0.5 bg-slate-700 text-slate-400 rounded text-[9px] font-medium">shared</span>
                          )}
                          {p.ownerId && p.ownerId === user?.id && (
                            <span className="ml-1.5 px-1.5 py-0.5 bg-violet-900/50 text-violet-300 rounded text-[9px] font-medium">yours</span>
                          )}
                        </p>
                      </div>
                      {(!p.ownerId || p.ownerId === user?.id) && (
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteProject(p.id); }}
                          className="p-1 text-slate-600 hover:text-red-400 transition-colors" title="Delete project">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Main edit / preview area ─────────────────────────────────────── */}
        {(studioView === 'edit' || studioView === 'preview') && (
          <div className="flex flex-1 min-h-0">

            {/* ── Left panel: page navigator + controls ─────────────────────── */}
            {studioView === 'edit' && (
            <div className="w-56 shrink-0 bg-slate-900/80 border-r border-slate-700/50 flex flex-col">
              {/* Page list header */}
              <div className="px-3 py-3 border-b border-slate-700/50">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Pages</p>
                <div className="flex gap-1">
                  <button onClick={() => addPage(1)} title="Add 1-column page"
                    className="flex-1 flex items-center justify-center gap-1 bg-slate-800 hover:bg-slate-700 border border-dashed border-slate-600 rounded-lg py-1.5 text-xs text-slate-400 transition-colors">
                    <Plus size={11} /> 1 col
                  </button>
                  <button onClick={() => addPage(2)} title="Add 2-column page"
                    className="flex-1 flex items-center justify-center gap-1 bg-slate-800 hover:bg-slate-700 border border-dashed border-slate-600 rounded-lg py-1.5 text-xs text-slate-400 transition-colors">
                    <Plus size={11} /> 2 col
                  </button>
                  <button onClick={() => addPage(3)} title="Add 3-column page"
                    className="flex-1 flex items-center justify-center gap-1 bg-slate-800 hover:bg-slate-700 border border-dashed border-slate-600 rounded-lg py-1.5 text-xs text-slate-400 transition-colors">
                    <Plus size={11} /> 3 col
                  </button>
                </div>
              </div>

              {/* Page thumbnails */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {pages.map((page, idx) => {
                  const collabsHere = collaborators.filter(c => c.activePage === idx);
                  return (
                    <div key={page.id}
                      onClick={() => setActivePageIdx(idx)}
                      className={classNames('page-thumb group relative bg-white rounded-lg overflow-hidden cursor-pointer', activePageIdx === idx && 'active')}>
                      {/* Mini page preview */}
                      <div className="p-2" style={{ aspectRatio: '210/297' }}>
                        <div className="w-full h-full flex gap-0.5">
                          {page.frames.map((f, fi) => (
                            <div key={f.id} className="flex-1 bg-slate-100 rounded-sm p-0.5">
                              {f.blocks.slice(0, 3).map(b => (
                                <div key={b.id} className={classNames('mb-0.5 rounded-sm', b.type === 'text' ? 'bg-slate-200 h-1.5' : 'bg-blue-200 h-3')} />
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Page number and controls */}
                      <div className="absolute bottom-0 left-0 right-0 bg-slate-900/90 px-2 py-1 flex items-center justify-between">
                        <span className="text-[10px] text-slate-300 font-medium">Page {idx + 1}</span>
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={e => { e.stopPropagation(); duplicatePage(idx); }}
                            className="p-0.5 text-slate-400 hover:text-white" title="Duplicate page">
                            <Copy size={10} />
                          </button>
                          {pages.length > 1 && (
                            <button onClick={e => { e.stopPropagation(); removePage(idx); }}
                              className="p-0.5 text-slate-400 hover:text-red-400" title="Remove page">
                              <Trash2 size={10} />
                            </button>
                          )}
                        </div>
                      </div>
                      {/* Collaborator indicators */}
                      {collabsHere.length > 0 && (
                        <div className="absolute top-1 right-1 flex -space-x-1">
                          {collabsHere.map(c => (
                            <div key={c.userId} className="w-4 h-4 rounded-full text-[8px] font-bold text-white flex items-center justify-center border border-white"
                              style={{ backgroundColor: c.color }}>
                              {c.name?.charAt(0)?.toUpperCase()}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Page layout controls */}
              <div className="px-3 py-3 border-t border-slate-700/50">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Page Layout</p>
                <div className="flex gap-1 mb-2">
                  {([1, 2, 3] as ColumnLayout[]).map(cols => (
                    <button key={cols} onClick={() => changePageColumns(activePage.id, cols)}
                      className={classNames('flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors',
                        activePage.columns === cols
                          ? 'bg-violet-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700')}>
                      {cols} col
                    </button>
                  ))}
                </div>
              </div>
            </div>
            )}

            {/* ── Center: page canvas ───────────────────────────────────────── */}
            <div className="flex-1 overflow-auto bg-slate-800/40 p-8 flex justify-center">
              <div ref={canvasRef}
                className="page-canvas rounded-sm"
                style={{
                  width: PAGE_CANVAS_WIDTH,
                  minHeight: PAGE_CANVAS_WIDTH * (297 / 210),
                  padding: activePage.marginPx,
                  backgroundColor: activePage.backgroundColor,
                }}
                onClick={() => { setSelectedBlockId(null); setSelectedFrameId(null); }}>

                <div className="flex gap-0" style={{ gap: activePage.gapPx }}>
                  {activePage.frames.map(frame => (
                    <div key={frame.id}
                      className={classNames('frame-column flex-1 rounded-sm relative')}
                      onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
                      onDragLeave={e => e.currentTarget.classList.remove('drag-over')}
                      onDrop={e => { e.currentTarget.classList.remove('drag-over'); handleFrameDrop(e, frame.id); }}
                      onClick={e => { e.stopPropagation(); setSelectedFrameId(frame.id); }}>

                      {/* Blocks */}
                      {frame.blocks.map((block, blockIdx) => (
                        <div key={block.id}
                          className={classNames(
                            'block-wrapper mb-2',
                            selectedBlockId === block.id && 'selected',
                            selectedBlockId === block.id && block.type === 'text' && 'text-editing',
                          )}
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedBlockId(block.id);
                            setSelectedFrameId(frame.id);
                          }}>

                          {/* Block toolbar */}
                          <div className="block-toolbar absolute -top-6 left-0 right-0 flex items-center gap-1 z-10">
                            <div className="flex items-center gap-0.5 bg-slate-900 rounded-md px-1 py-0.5 shadow-lg border border-slate-700">
                              {blockIdx > 0 && (
                                <button onMouseDown={e => e.preventDefault()} onClick={e => { e.stopPropagation(); moveBlockInFrame(frame.id, block.id, -1); }}
                                  className="p-0.5 text-slate-400 hover:text-white" title="Move up">
                                  <ChevronLeft size={10} />
                                </button>
                              )}
                              {blockIdx < frame.blocks.length - 1 && (
                                <button onMouseDown={e => e.preventDefault()} onClick={e => { e.stopPropagation(); moveBlockInFrame(frame.id, block.id, 1); }}
                                  className="p-0.5 text-slate-400 hover:text-white" title="Move down">
                                  <ChevronRight size={10} />
                                </button>
                              )}
                              <button onMouseDown={e => e.preventDefault()} onClick={e => { e.stopPropagation(); removeBlock(block.id); }}
                                className="p-0.5 text-slate-400 hover:text-red-400" title="Delete block">
                                <Trash2 size={10} />
                              </button>
                            </div>
                          </div>

                          {/* Render block */}
                          {block.type === 'text' ? (
                            <div
                              ref={el => {
                                if (el) {
                                  ceRefs.current.set(block.id, el);
                                  // Set initial content if empty DOM but state has content
                                  if (!el.innerHTML && block.content) {
                                    el.innerHTML = block.content;
                                  }
                                } else {
                                  ceRefs.current.delete(block.id);
                                }
                              }}
                              contentEditable={studioView === 'edit'}
                              suppressContentEditableWarning
                              onInput={() => {
                                // Sync contentEditable DOM → React state (for save/collab)
                                const el = ceRefs.current.get(block.id);
                                if (el) {
                                  const html = el.innerHTML;
                                  updateBlock(block.id, b => ({ ...b, content: html } as TextBlock));
                                }
                              }}
                              onBlur={() => pushUndo()}
                              onMouseDown={e => e.stopPropagation()}
                              onKeyDown={e => e.stopPropagation()}
                              onFocus={() => {
                                // Ensure this block is selected so properties panel shows
                                setSelectedBlockId(block.id);
                                setSelectedFrameId(frame.id);
                              }}
                              onPaste={e => {
                                e.preventDefault();
                                const html = e.clipboardData.getData('text/html');
                                const text = e.clipboardData.getData('text/plain');
                                if (html) {
                                  document.execCommand('insertHTML', false, html);
                                } else {
                                  document.execCommand('insertText', false, text);
                                }
                              }}
                              data-placeholder="Start typing…"
                              className="p-2 min-h-[40px] max-h-[500px] overflow-y-auto outline-none cursor-text rich-text-block"
                              style={{
                                fontFamily: block.fontFamily,
                                fontSize: block.fontSize,
                                fontWeight: block.fontWeight,
                                fontStyle: block.fontStyle,
                                textAlign: block.textAlign,
                                color: block.color,
                                lineHeight: block.lineHeight,
                                wordBreak: 'break-word',
                              }}
                            />
                          ) : block.type === 'image' ? (
                            <div className="relative">
                              <img
                                src={block.src}
                                alt={block.alt}
                                className="w-full rounded-sm"
                                style={{ objectFit: block.fit, maxHeight: 400 }}
                              />
                              {selectedBlockId === block.id && (
                                <input
                                  type="text"
                                  value={block.caption}
                                  onChange={e => updateBlock(block.id, b => ({ ...b, caption: e.target.value } as ImageBlock))}
                                  onBlur={() => pushUndo()}
                                  placeholder="Add caption…"
                                  className="w-full mt-1 bg-slate-100 text-slate-700 text-xs px-2 py-1 rounded outline-none"
                                />
                              )}
                              {block.caption && selectedBlockId !== block.id && (
                                <p className="text-xs text-slate-500 italic mt-1 px-1">{block.caption}</p>
                              )}
                            </div>
                          ) : null}
                        </div>
                      ))}

                      {/* Add block buttons */}
                      {studioView === 'edit' && (
                        <div className="flex gap-1 mt-2 pt-2 border-t border-dashed border-slate-200">
                          <button onClick={e => { e.stopPropagation(); addTextBlock(frame.id); }}
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-xs text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors">
                            <Type size={11} /> Text
                          </button>
                          <label
                            onMouseDown={e => e.preventDefault()}
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-xs text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors cursor-pointer">
                            <ImageIcon size={11} /> Image
                            <input type="file" accept="image/*" className="hidden"
                              onChange={e => handleImageUpload(e, frame.id)} />
                          </label>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Right panel: block properties ────────────────────────────── */}
            {studioView === 'edit' && (
            <div className="w-56 shrink-0 bg-slate-900/80 border-l border-slate-700/50 flex flex-col overflow-y-auto">
              <div className="px-3 py-3 border-b border-slate-700/50">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Properties</p>
              </div>

              {selectedBlock && selectedBlock.type === 'text' ? (
                <div className="p-3 space-y-3">
                  {/* Font family */}
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Font</label>
                    <select
                      onMouseDown={e => { if (hasSelection()) e.preventDefault(); }}
                      value={selectedBlock.fontFamily}
                      onChange={e => {
                        const val = e.target.value;
                        if (hasSelection()) {
                          applyFontFamilyToSelection(val);
                        } else {
                          updateBlockWithUndo(selectedBlockId!, b => ({ ...b, fontFamily: val } as TextBlock));
                        }
                      }}
                      className="w-full mt-1 bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400">
                      {FONT_FAMILIES.map(f => (
                        <option key={f} value={f} style={{ fontFamily: f }}>{f.split(',')[0]}</option>
                      ))}
                    </select>
                  </div>

                  {/* Font size */}
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Size</label>
                    <select
                      onMouseDown={e => { if (hasSelection()) e.preventDefault(); }}
                      value={selectedBlock.fontSize}
                      onChange={e => {
                        const val = Number(e.target.value);
                        if (hasSelection()) {
                          applyFontSizeToSelection(val);
                        } else {
                          updateBlockWithUndo(selectedBlockId!, b => ({ ...b, fontSize: val } as TextBlock));
                        }
                      }}
                      className="w-full mt-1 bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400">
                      {FONT_SIZES.map(s => (
                        <option key={s} value={s}>{s}px</option>
                      ))}
                    </select>
                  </div>

                  {/* Bold / Italic */}
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Style</label>
                    <div className="flex gap-1 mt-1">
                      <button
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => {
                          if (hasSelection()) {
                            execOnSelection('bold');
                            const el = ceRefs.current.get(selectedBlockId!);
                            if (el) updateBlock(selectedBlockId!, b => ({ ...b, content: el.innerHTML } as TextBlock));
                          } else {
                            updateBlockWithUndo(selectedBlockId!, b => ({ ...b, fontWeight: (b as TextBlock).fontWeight === 'bold' ? 'normal' : 'bold' } as TextBlock));
                          }
                        }}
                        className={classNames('flex-1 flex items-center justify-center py-1.5 rounded-md text-xs font-semibold transition-colors',
                          selectedBlock.fontWeight === 'bold' ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white')}>
                        <Bold size={13} />
                      </button>
                      <button
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => {
                          if (hasSelection()) {
                            execOnSelection('italic');
                            const el = ceRefs.current.get(selectedBlockId!);
                            if (el) updateBlock(selectedBlockId!, b => ({ ...b, content: el.innerHTML } as TextBlock));
                          } else {
                            updateBlockWithUndo(selectedBlockId!, b => ({ ...b, fontStyle: (b as TextBlock).fontStyle === 'italic' ? 'normal' : 'italic' } as TextBlock));
                          }
                        }}
                        className={classNames('flex-1 flex items-center justify-center py-1.5 rounded-md text-xs font-semibold transition-colors',
                          selectedBlock.fontStyle === 'italic' ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white')}>
                        <Italic size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Alignment */}
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Alignment</label>
                    <div className="flex gap-1 mt-1">
                      {([
                        { align: 'left' as TextAlign, icon: AlignLeft },
                        { align: 'center' as TextAlign, icon: AlignCenter },
                        { align: 'right' as TextAlign, icon: AlignRight },
                      ]).map(({ align, icon: Icon }) => (
                        <button key={align}
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => updateBlockWithUndo(selectedBlockId!, b => ({ ...b, textAlign: align } as TextBlock))}
                          className={classNames('flex-1 flex items-center justify-center py-1.5 rounded-md text-xs transition-colors',
                            selectedBlock.textAlign === align ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white')}>
                          <Icon size={13} />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Color */}
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Color</label>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="color"
                        onMouseDown={e => { if (hasSelection()) e.preventDefault(); }}
                        value={selectedBlock.color}
                        onChange={e => {
                          const val = e.target.value;
                          if (hasSelection()) {
                            applyColorToSelection(val);
                          } else {
                            updateBlockWithUndo(selectedBlockId!, b => ({ ...b, color: val } as TextBlock));
                          }
                        }}
                        className="w-8 h-8 rounded-md border border-slate-700 cursor-pointer bg-transparent"
                      />
                      <input
                        type="text"
                        value={selectedBlock.color}
                        onChange={e => {
                          const val = e.target.value;
                          updateBlockWithUndo(selectedBlockId!, b => ({ ...b, color: val } as TextBlock));
                        }}
                        className="flex-1 bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400"
                      />
                    </div>
                  </div>

                  {/* Line height */}
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Line Height</label>
                    <input
                      type="range" min="1" max="2.5" step="0.1"
                      onMouseDown={e => e.preventDefault()}
                      value={selectedBlock.lineHeight}
                      onChange={e => updateBlockWithUndo(selectedBlockId!, b => ({ ...b, lineHeight: Number(e.target.value) } as TextBlock))}
                      className="w-full mt-1 accent-violet-500"
                    />
                    <span className="text-[10px] text-slate-500">{selectedBlock.lineHeight}×</span>
                  </div>

                  {/* Insert inline image */}
                  <div className="pt-2 border-t border-slate-700/50">
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Insert Image at Cursor</label>
                    <label
                      onMouseDown={e => e.preventDefault()}
                      className="mt-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer transition-colors">
                      <ImageIcon size={13} /> Choose Image
                      <input ref={inlineImgInputRef} type="file" accept="image/*" className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (file) insertInlineImage(file);
                        }} />
                    </label>
                  </div>
                </div>
              ) : selectedBlock && selectedBlock.type === 'image' ? (
                <div className="p-3 space-y-3">
                  {/* Image fit */}
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Fit</label>
                    <div className="flex gap-1 mt-1">
                      {(['contain', 'cover'] as const).map(fit => (
                        <button key={fit}
                          onClick={() => updateBlockWithUndo(selectedBlockId!, b => ({ ...b, fit } as ImageBlock))}
                          className={classNames('flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors',
                            (selectedBlock as ImageBlock).fit === fit ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white')}>
                          {fit === 'contain' ? 'Fit' : 'Fill'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Alt text */}
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Alt Text</label>
                    <input
                      type="text"
                      value={(selectedBlock as ImageBlock).alt}
                      onChange={e => updateBlockWithUndo(selectedBlockId!, b => ({ ...b, alt: e.target.value } as ImageBlock))}
                      placeholder="Describe this image…"
                      className="w-full mt-1 bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400 placeholder-slate-500"
                    />
                  </div>
                </div>
              ) : (
                <div className="p-4 text-center">
                  <Type size={24} className="mx-auto mb-2 text-slate-600 opacity-40" />
                  <p className="text-xs text-slate-500">Select a text or image block to see its properties.</p>
                  <p className="text-[10px] text-slate-600 mt-1">Select text to format just that selection.</p>
                </div>
              )}

              {/* Page properties */}
              <div className="mt-auto px-3 py-3 border-t border-slate-700/50 space-y-2">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Page Settings</p>
                <div>
                  <label className="text-[10px] text-slate-500">Background</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="color"
                      value={activePage.backgroundColor}
                      onChange={e => {
                        pushUndo();
                        const bg = e.target.value;
                        const updated = pages.map(p => p.id === activePage.id ? { ...p, backgroundColor: bg } : p);
                        setPages(updated);
                        broadcastPageUpdate(updated);
                      }}
                      className="w-6 h-6 rounded border border-slate-700 cursor-pointer bg-transparent"
                    />
                    <span className="text-[10px] text-slate-400">{activePage.backgroundColor}</span>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500">Margin</label>
                  <input
                    type="range" min="10" max="80" step="5"
                    value={activePage.marginPx}
                    onChange={e => {
                      const m = Number(e.target.value);
                      const updated = pages.map(p => p.id === activePage.id ? { ...p, marginPx: m } : p);
                      setPages(updated);
                      broadcastPageUpdate(updated);
                    }}
                    className="w-full mt-1 accent-violet-500"
                  />
                  <span className="text-[10px] text-slate-500">{activePage.marginPx}px</span>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500">Column Gap</label>
                  <input
                    type="range" min="0" max="60" step="4"
                    value={activePage.gapPx}
                    onChange={e => {
                      const g = Number(e.target.value);
                      const updated = pages.map(p => p.id === activePage.id ? { ...p, gapPx: g } : p);
                      setPages(updated);
                      broadcastPageUpdate(updated);
                    }}
                    className="w-full mt-1 accent-violet-500"
                  />
                  <span className="text-[10px] text-slate-500">{activePage.gapPx}px</span>
                </div>
              </div>
            </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default DocumentStudioPage;

/*
── DATABASE MIGRATION ─────────────────────────────────────────────────────────

If you already created the table, run this to add org-scoped collaboration:

ALTER TABLE document_studio_projects
  ADD COLUMN IF NOT EXISTS organization_id uuid;

-- Drop the old owner-only policy
DROP POLICY IF EXISTS "Users can manage own doc studio projects"
  ON document_studio_projects;

-- New: any org member can read org documents
CREATE POLICY "Org members can view doc studio projects"
  ON document_studio_projects
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM get_my_effective_profile()
    )
  );

-- New: any org member can insert into their org
CREATE POLICY "Org members can create doc studio projects"
  ON document_studio_projects
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM get_my_effective_profile()
    )
  );

-- New: any org member can update org documents
CREATE POLICY "Org members can update doc studio projects"
  ON document_studio_projects
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM get_my_effective_profile()
    )
  );

-- Delete restricted to owner
CREATE POLICY "Owner can delete doc studio projects"
  ON document_studio_projects
  FOR DELETE
  USING (auth.uid() = user_id);

── ROUTING ────────────────────────────────────────────────────────────────────

Add to your router (e.g. App.tsx):

  import DocumentStudioPage from './pages/tech-skills/DocumentStudioPage';
  <Route path="/tech-skills/document-studio" element={<DocumentStudioPage />} />

────────────────────────────────────────────────────────────────────────────────
*/