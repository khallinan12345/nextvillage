// src/components/BookModal.tsx
//
// Full-screen reading modal for "Before the Lights Come On"
// Fetches /book.json from the React app's public/ folder.
//
// Usage in PublicLandingPage.tsx:
//   import { BookCard, BookModal } from "../components/BookModal";
//   — add <BookCard /> inside the Voices grid
//   — add <BookModal open={bookOpen} onClose={() => setBookOpen(false)} />
//   — add useState: const [bookOpen, setBookOpen] = useState(false);
//   — pass onOpen={() => setBookOpen(true)} to BookCard

import React, { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, X, Menu } from "lucide-react";

// ─── Data types ───────────────────────────────────────────────────────────────

export interface BookSection {
  heading?: string | null;
  paragraphs: string[];
}

export interface BookChapter {
  id: string;
  title: string;
  byline?: string | null;
  sections: BookSection[];
}

export interface BookPart {
  id: string;
  label: string;          // "Prologue" | "Part One: ..." | "Epilogue"
  chapters: BookChapter[];
}

export interface BookData {
  title: string;
  subtitle?: string;
  lastUpdated?: string;   // ISO date string
  parts: BookPart[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Flatten all chapters in order so we can do prev/next navigation */
function flatChapters(parts: BookPart[]): { part: BookPart; chapter: BookChapter }[] {
  return parts.flatMap(part => part.chapters.map(chapter => ({ part, chapter })));
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

const Skeleton: React.FC<{ width?: string | number; height?: number; style?: React.CSSProperties }> = ({
  width = "100%", height = 16, style,
}) => (
  <div style={{
    width, height,
    borderRadius: 4,
    background: "linear-gradient(90deg,rgba(255,255,255,0.06) 25%,rgba(255,255,255,0.1) 50%,rgba(255,255,255,0.06) 75%)",
    backgroundSize: "200% 100%",
    animation: "shimmer 1.6s infinite",
    ...style,
  }} />
);

// ─── BookCard (trigger, drop into Voices grid) ────────────────────────────────

export const BookCard: React.FC<{ onOpen: () => void }> = ({ onOpen }) => (
  <button
    onClick={onOpen}
    style={{
      all: "unset", cursor: "pointer", display: "block",
      textDecoration: "none", width: "100%",
      transition: "transform 0.2s",
    }}
    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-4px)"; }}
    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; }}
  >
    <div style={{
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(217,119,6,0.3)",
      borderRadius: 16, padding: "1.75rem", height: "100%",
      position: "relative", overflow: "hidden",
      boxSizing: "border-box",
    }}>
      {/* Amber top accent */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg,#d97706,#fbbf24)" }} />

      {/* Subtle book-spine glow */}
      <div style={{
        position: "absolute", top: -60, right: -60,
        width: 160, height: 160, borderRadius: "50%",
        background: "radial-gradient(circle,rgba(217,119,6,0.08) 0%,transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
        <div style={{
          width: 44, height: 44, borderRadius: "50%",
          background: "rgba(217,119,6,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "1.3rem", flexShrink: 0,
        }}>📖</div>
        <div>
          <div style={{ fontWeight: 700, color: "#fff", fontSize: "0.95rem", fontFamily: "'Playfair Display', serif" }}>
            Before the Lights Come On
          </div>
          <div style={{ fontSize: "0.75rem", color: "#fbbf24", fontWeight: 600 }}>
            An Essay Collection · Living Document
          </div>
        </div>
      </div>

      <p style={{ fontSize: "0.87rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.72, margin: "0 0 1.25rem" }}>
        Nine essays — from Oloibiri and Dayton — written by the people who built this, lived it,
        and are still in the middle of it. A prologue, four parts, and an epilogue that is not yet finished.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", fontWeight: 600, color: "#d97706" }}>
          <BookOpen size={13} /> Read the book
        </div>
        <div style={{
          fontSize: "0.69rem", color: "rgba(255,255,255,0.28)",
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 99, padding: "0.2rem 0.6rem",
          fontWeight: 600,
        }}>
          Updated as the story grows
        </div>
      </div>
    </div>
  </button>
);

// ─── BookModal ─────────────────────────────────────────────────────────────────

export const BookModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {

  const [book, setBook]           = useState<BookData | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [activeChapterId, setActive] = useState<string | null>(null);
  const [sidebarOpen, setSidebar] = useState(true);
  const [scrollPct, setScrollPct] = useState(0);
  const [entering, setEntering]   = useState(false);
  const contentRef                = useRef<HTMLDivElement>(null);
  const hasFetched                = useRef(false);

  // Fetch once
  useEffect(() => {
    if (!open || hasFetched.current) return;
    hasFetched.current = true;
    setLoading(true);
    fetch("/book.json")
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<BookData>;
      })
      .then(data => {
        setBook(data);
        // Select first chapter
        const first = data.parts[0]?.chapters[0];
        if (first) setActive(first.id);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [open]);

  // Scroll progress
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const handler = () => {
      const pct = el.scrollHeight > el.clientHeight
        ? el.scrollTop / (el.scrollHeight - el.clientHeight)
        : 0;
      setScrollPct(pct);
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, [activeChapterId]);

  // Reset scroll on chapter change + animate
  const goToChapter = useCallback((id: string) => {
    setEntering(true);
    setTimeout(() => {
      setActive(id);
      contentRef.current?.scrollTo({ top: 0 });
      setScrollPct(0);
      setTimeout(() => setEntering(false), 50);
    }, 140);
  }, []);

  // Keyboard
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (!book) return;
      const flat = flatChapters(book.parts);
      const idx  = flat.findIndex(c => c.chapter.id === activeChapterId);
      if (e.key === "ArrowRight" && idx < flat.length - 1) goToChapter(flat[idx + 1].chapter.id);
      if (e.key === "ArrowLeft"  && idx > 0)               goToChapter(flat[idx - 1].chapter.id);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, book, activeChapterId, onClose, goToChapter]);

  if (!open) return null;

  const flat        = book ? flatChapters(book.parts) : [];
  const currentIdx  = flat.findIndex(c => c.chapter.id === activeChapterId);
  const current     = flat[currentIdx] ?? null;
  const hasPrev     = currentIdx > 0;
  const hasNext     = currentIdx < flat.length - 1;

  const SIDEBAR_W  = 272;
  const AMBER      = "#d97706";
  const AMBER_SOFT = "#fbbf24";
  const BG         = "#07100a";
  const SURFACE    = "rgba(255,255,255,0.03)";
  const BORDER     = "rgba(255,255,255,0.07)";

  return (
    <>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.975); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes chapterFade {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .bm-chapter-content {
          animation: chapterFade 0.28s ease both;
        }
        .bm-chapter-content.exiting {
          opacity: 0; transform: translateY(-6px);
          transition: opacity 0.14s ease, transform 0.14s ease;
        }
        .bm-toc-item {
          display: block; width: 100%; text-align: left; border: none;
          background: transparent; cursor: pointer;
          padding: 0.52rem 1.1rem 0.52rem 1.5rem;
          font-family: 'DM Sans', sans-serif;
          font-size: 0.8rem; font-weight: 500;
          color: rgba(255,255,255,0.42);
          border-left: 2px solid transparent;
          transition: color 0.15s, border-color 0.15s, background 0.15s;
          line-height: 1.4; white-space: normal;
        }
        .bm-toc-item:hover {
          color: rgba(255,255,255,0.8);
          background: rgba(255,255,255,0.04);
        }
        .bm-toc-item.active {
          color: ${AMBER};
          border-left-color: ${AMBER};
          background: rgba(217,119,6,0.07);
          font-weight: 700;
        }
        .bm-close {
          display: flex; align-items: center; justify-content: center;
          width: 36px; height: 36px; border-radius: 8px;
          background: rgba(255,255,255,0.06);
          border: 1px solid ${BORDER};
          color: rgba(255,255,255,0.5); cursor: pointer;
          transition: background 0.15s, color 0.15s;
          flex-shrink: 0;
        }
        .bm-close:hover { background: rgba(255,255,255,0.12); color: #fff; }
        .bm-nav-btn {
          display: inline-flex; align-items: center; gap: 0.4rem;
          padding: 0.6rem 1.2rem; border-radius: 8px;
          background: rgba(255,255,255,0.06);
          border: 1px solid ${BORDER};
          color: rgba(255,255,255,0.6);
          font-family: 'DM Sans', sans-serif;
          font-size: 0.82rem; font-weight: 600;
          cursor: pointer; transition: background 0.15s, color 0.15s;
        }
        .bm-nav-btn:hover { background: rgba(255,255,255,0.11); color: #fff; }
        .bm-nav-btn:disabled { opacity: 0.3; cursor: default; pointer-events: none; }
        .bm-sidebar-toggle {
          display: none;
        }
        @media (max-width: 768px) {
          .bm-sidebar { position: absolute !important; left: 0 !important; top: 0 !important; bottom: 0 !important; z-index: 10 !important; }
          .bm-sidebar-toggle { display: flex !important; }
        }
      `}</style>

      {/* Overlay */}
      <div
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.85)",
          backdropFilter: "blur(4px)",
          display: "flex", alignItems: "stretch", justifyContent: "center",
        }}
      >
        {/* Modal shell */}
        <div style={{
          width: "100%", maxWidth: 1280,
          background: BG,
          display: "flex", flexDirection: "column",
          animation: "modalIn 0.3s cubic-bezier(0.16,1,0.3,1) both",
          position: "relative", overflow: "hidden",
        }}>

          {/* ── Reading progress bar ──────────────────────────────────── */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "rgba(255,255,255,0.05)", zIndex: 5 }}>
            <div style={{
              height: "100%", width: `${scrollPct * 100}%`,
              background: `linear-gradient(90deg,${AMBER},${AMBER_SOFT})`,
              transition: "width 0.1s linear",
            }} />
          </div>

          {/* ── Header bar ───────────────────────────────────────────── */}
          <div style={{
            display: "flex", alignItems: "center", gap: "1rem",
            padding: "0 1.5rem", height: 58,
            borderBottom: `1px solid ${BORDER}`,
            flexShrink: 0, background: "rgba(0,0,0,0.25)",
            backdropFilter: "blur(8px)",
          }}>
            {/* Mobile sidebar toggle */}
            <button
              className="bm-close bm-sidebar-toggle"
              onClick={() => setSidebar(o => !o)}
              aria-label="Toggle contents"
              style={{ display: "none" }}
            >
              <Menu size={16} />
            </button>

            <BookOpen size={16} color={AMBER} style={{ flexShrink: 0 }} />
            <div style={{
              fontFamily: "'Playfair Display', serif",
              fontWeight: 700, fontSize: "0.95rem", color: "#fff",
              flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {book?.title ?? "Before the Lights Come On"}
            </div>

            {book?.lastUpdated && (
              <div style={{
                fontSize: "0.68rem", color: "rgba(255,255,255,0.28)",
                fontWeight: 600, flexShrink: 0,
              }}>
                Updated {new Date(book.lastUpdated).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </div>
            )}

            <div style={{ height: 20, width: 1, background: BORDER, flexShrink: 0 }} />

            {/* Chapter indicator */}
            {current && (
              <div style={{ fontSize: "0.73rem", color: "rgba(255,255,255,0.3)", flexShrink: 0, display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <span style={{ color: AMBER, fontWeight: 700 }}>{currentIdx + 1}</span>
                <span>/</span>
                <span>{flat.length}</span>
              </div>
            )}

            <button className="bm-close" onClick={onClose} aria-label="Close book">
              <X size={16} />
            </button>
          </div>

          {/* ── Body: sidebar + content ───────────────────────────────── */}
          <div style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}>

            {/* ── Table of Contents sidebar ─────────────────────── */}
            {sidebarOpen && (
              <div
                className="bm-sidebar"
                style={{
                  width: SIDEBAR_W, flexShrink: 0,
                  background: "rgba(0,0,0,0.2)",
                  borderRight: `1px solid ${BORDER}`,
                  overflowY: "auto",
                  display: "flex", flexDirection: "column",
                }}
              >
                {/* Sidebar header */}
                <div style={{
                  padding: "1.25rem 1.5rem 0.75rem",
                  fontSize: "0.62rem", fontWeight: 700,
                  color: "rgba(255,255,255,0.22)",
                  textTransform: "uppercase", letterSpacing: "0.12em",
                  borderBottom: `1px solid ${BORDER}`,
                  marginBottom: "0.5rem",
                }}>
                  Contents
                </div>

                {loading && (
                  <div style={{ padding: "1rem 1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {[70, 55, 85, 60, 75, 50, 90, 65].map((w, i) => (
                      <Skeleton key={i} width={`${w}%`} height={12} />
                    ))}
                  </div>
                )}

                {book?.parts.map(part => (
                  <div key={part.id} style={{ marginBottom: "0.5rem" }}>
                    <div style={{
                      padding: "0.65rem 1.5rem 0.3rem",
                      fontSize: "0.62rem", fontWeight: 700,
                      color: AMBER, textTransform: "uppercase",
                      letterSpacing: "0.1em", lineHeight: 1.4,
                    }}>
                      {part.label}
                    </div>
                    {part.chapters.map(ch => (
                      <button
                        key={ch.id}
                        className={`bm-toc-item${ch.id === activeChapterId ? " active" : ""}`}
                        onClick={() => goToChapter(ch.id)}
                      >
                        {ch.title}
                      </button>
                    ))}
                  </div>
                ))}

                {/* Spacer */}
                <div style={{ flex: 1 }} />

                {/* Keyboard hint */}
                <div style={{
                  padding: "0.85rem 1.5rem",
                  borderTop: `1px solid ${BORDER}`,
                  fontSize: "0.65rem", color: "rgba(255,255,255,0.2)",
                  lineHeight: 1.6,
                }}>
                  ← → navigate chapters · Esc close
                </div>
              </div>
            )}

            {/* ── Reading area ──────────────────────────────────── */}
            <div
              ref={contentRef}
              style={{
                flex: 1, overflowY: "auto",
                padding: "3.5rem 2rem 6rem",
                display: "flex", flexDirection: "column", alignItems: "center",
              }}
            >
              <div style={{ width: "100%", maxWidth: 680 }}>

                {/* Loading state */}
                {loading && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
                    <Skeleton width="35%" height={13} />
                    <Skeleton width="75%" height={42} />
                    <Skeleton width="30%" height={13} />
                    <div style={{ height: 1, background: BORDER, margin: "0.5rem 0" }} />
                    {[100, 95, 88, 100, 72, 90, 85, 100, 60, 95, 78, 100].map((w, i) => (
                      <Skeleton key={i} width={`${w}%`} height={13} />
                    ))}
                  </div>
                )}

                {/* Error state */}
                {error && !loading && (
                  <div style={{
                    background: "rgba(248,113,113,0.08)",
                    border: "1px solid rgba(248,113,113,0.2)",
                    borderRadius: 12, padding: "2rem",
                    textAlign: "center",
                  }}>
                    <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>📚</div>
                    <div style={{ fontWeight: 700, color: "#f87171", marginBottom: "0.5rem" }}>
                      Couldn't load the book
                    </div>
                    <div style={{ fontSize: "0.83rem", color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
                      Make sure <code style={{ color: "rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.06)", padding: "0.1rem 0.4rem", borderRadius: 4 }}>/book.json</code> is in the <code style={{ color: "rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.06)", padding: "0.1rem 0.4rem", borderRadius: 4 }}>public/</code> folder of the React app.
                    </div>
                  </div>
                )}

                {/* Chapter content */}
                {current && !loading && !error && (
                  <div className={`bm-chapter-content${entering ? " exiting" : ""}`}>

                    {/* Part label */}
                    <div style={{
                      fontSize: "0.65rem", fontWeight: 700,
                      color: AMBER, textTransform: "uppercase",
                      letterSpacing: "0.14em", marginBottom: "0.9rem",
                    }}>
                      {current.part.label}
                    </div>

                    {/* Chapter title */}
                    <h2 style={{
                      fontFamily: "'Playfair Display', serif",
                      fontSize: "clamp(1.8rem,4vw,2.8rem)",
                      fontWeight: 900, color: "#fff",
                      lineHeight: 1.12, margin: "0 0 0.75rem",
                    }}>
                      {current.chapter.title}
                    </h2>

                    {/* Byline */}
                    {current.chapter.byline && (
                      <div style={{
                        fontSize: "0.9rem", fontStyle: "italic",
                        color: "rgba(255,255,255,0.4)",
                        marginBottom: "1.75rem",
                      }}>
                        {current.chapter.byline}
                      </div>
                    )}

                    {/* Divider */}
                    <div style={{
                      height: 1, marginBottom: "2.25rem",
                      background: `linear-gradient(90deg,${AMBER}55,transparent)`,
                    }} />

                    {/* Sections */}
                    {current.chapter.sections.map((section, si) => (
                      <div key={si} style={{ marginBottom: "2rem" }}>
                        {section.heading && (
                          <h3 style={{
                            fontFamily: "'Playfair Display', serif",
                            fontSize: "1.15rem", fontWeight: 700,
                            color: AMBER_SOFT,
                            margin: "0 0 0.9rem",
                          }}>
                            {section.heading}
                          </h3>
                        )}
                        {section.paragraphs.map((p, pi) => (
                          <p key={pi} style={{
                            fontSize: "1rem", lineHeight: 1.88,
                            color: "rgba(255,255,255,0.75)",
                            margin: "0 0 1.2rem",
                            fontFamily: "'DM Sans', sans-serif",
                          }}>
                            {p}
                          </p>
                        ))}
                      </div>
                    ))}

                    {/* Chapter nav footer */}
                    <div style={{
                      display: "flex", justifyContent: "space-between",
                      alignItems: "center", flexWrap: "wrap", gap: "1rem",
                      marginTop: "3.5rem", paddingTop: "2rem",
                      borderTop: `1px solid ${BORDER}`,
                    }}>
                      <button
                        className="bm-nav-btn"
                        disabled={!hasPrev}
                        onClick={() => hasPrev && goToChapter(flat[currentIdx - 1].chapter.id)}
                      >
                        <ChevronLeft size={15} />
                        {hasPrev ? flat[currentIdx - 1].chapter.title : ""}
                      </button>

                      <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.2)", fontWeight: 600 }}>
                        {currentIdx + 1} / {flat.length}
                      </span>

                      <button
                        className="bm-nav-btn"
                        disabled={!hasNext}
                        onClick={() => hasNext && goToChapter(flat[currentIdx + 1].chapter.id)}
                      >
                        {hasNext ? flat[currentIdx + 1].chapter.title : ""}
                        <ChevronRight size={15} />
                      </button>
                    </div>

                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default BookModal;
