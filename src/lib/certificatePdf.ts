// src/lib/certificatePdf.ts
// Shared "Certificate of Achievement" PDF generator for completed certification
// tracks (tech-skills and community-impact). Each caller supplies its own title,
// description, theme, and assessment scores; this module owns the shared layout —
// borders, header, branding footer, competency grid, and footer.
//
// Not used by the Microsoft cert-prep pages (AB-730, AI-900, DP-900, GH-300) —
// those prepare learners for an official external exam and don't issue a
// certificate of their own.

import { addBrandingToPDF, type Branding } from './useBranding';

export interface CertificateScore {
  assessment_name: string;
  score: number | null;
  evidence?: string | null;
}

export interface CertificateTheme {
  borderPrimary: [number, number, number];
  borderSecondary: [number, number, number];
  titleColor: [number, number, number];
  subtitleColor: [number, number, number];
}

// Named after the accent each certification track already uses elsewhere in its UI.
export const CERTIFICATE_THEMES = {
  teal:    { borderPrimary: [20, 184, 166], borderSecondary: [16, 185, 129], titleColor: [20, 184, 166], subtitleColor: [16, 185, 129] },
  emerald: { borderPrimary: [16, 185, 129], borderSecondary: [20, 184, 166], titleColor: [16, 185, 129], subtitleColor: [20, 184, 166] },
  indigo:  { borderPrimary: [99, 102, 241],  borderSecondary: [129, 140, 248], titleColor: [99, 102, 241],  subtitleColor: [79, 70, 229] },
  fuchsia: { borderPrimary: [217, 70, 239],  borderSecondary: [236, 72, 153],  titleColor: [217, 70, 239],  subtitleColor: [236, 72, 153] },
  amber:   { borderPrimary: [217, 119, 6],   borderSecondary: [245, 158, 11],  titleColor: [217, 119, 6],   subtitleColor: [245, 158, 11] },
  violet:  { borderPrimary: [124, 58, 237],  borderSecondary: [167, 139, 250], titleColor: [124, 58, 237],  subtitleColor: [167, 139, 250] },
  purple:  { borderPrimary: [109, 40, 217],  borderSecondary: [139, 92, 246],  titleColor: [109, 40, 217],  subtitleColor: [139, 92, 246] },
  cyan:    { borderPrimary: [6, 182, 212],   borderSecondary: [20, 184, 166],  titleColor: [6, 182, 212],   subtitleColor: [20, 184, 166] },
  pink:    { borderPrimary: [219, 39, 119],  borderSecondary: [236, 72, 153],  titleColor: [219, 39, 119],  subtitleColor: [168, 85, 247] },
  green:   { borderPrimary: [22, 163, 74],   borderSecondary: [74, 222, 128],  titleColor: [22, 163, 74],   subtitleColor: [74, 222, 128] },
  rose:    { borderPrimary: [225, 29, 72],   borderSecondary: [251, 113, 133], titleColor: [225, 29, 72],   subtitleColor: [251, 113, 133] },
} as const satisfies Record<string, CertificateTheme>;

export type CertificateThemeName = keyof typeof CERTIFICATE_THEMES;

export interface GenerateCertificateOptions {
  recipientName: string;
  /** Certification name shown in the subtitle, e.g. "AI Voice Creation Certification". */
  title: string;
  /** Body copy under the recipient's name. Pass pre-wrapped lines for exact control, or a single string to auto-wrap. */
  description: string | string[];
  /** Appended after the level on the score line, e.g. "· 3 voices produced". */
  scoreSuffix?: string;
  /** Optional italic line shown under the score (e.g. a quoted excerpt of the learner's work). */
  excerpt?: string;
  assessmentScores: CertificateScore[];
  branding: Branding;
  theme: CertificateTheme | CertificateThemeName;
  /** Short prefix for the certification ID, e.g. "VOI" -> "Certification ID: VOI-AB12CD3". */
  idPrefix: string;
  /** Appended to the downloaded filename, e.g. "VoiceCreation" -> "Jane-Doe-VoiceCreation-Certificate.pdf". */
  filenameSuffix: string;
}

const overallLevelLabel = (minScore: number) =>
  minScore === 3 ? 'Advanced' : minScore >= 2 ? 'Proficient' : 'Emerging';

const itemLevelLabel = (score: number | null | undefined) =>
  score === 3 ? 'Advanced' : score === 2 ? 'Proficient' : score === 1 ? 'Emerging' : 'No Evidence';

const makeCertId = () => Math.random().toString(36).substring(2, 9).toUpperCase();

export async function generateCertificatePdf(opts: GenerateCertificateOptions): Promise<void> {
  const {
    recipientName, title, description, scoreSuffix, excerpt,
    assessmentScores, branding, idPrefix, filenameSuffix,
  } = opts;
  const theme = typeof opts.theme === 'string' ? CERTIFICATE_THEMES[opts.theme] : opts.theme;

  const jsPDFModule = await import('jspdf').catch(() => null);
  if (!jsPDFModule) throw new Error('PDF generation is not available right now.');
  const { jsPDF } = jsPDFModule;
  const doc: any = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  const minScore  = Math.min(...assessmentScores.map(s => s.score ?? 0));
  const certLevel = overallLevelLabel(minScore);
  const avg       = assessmentScores.reduce((s, a) => s + (a.score ?? 0), 0) / assessmentScores.length;

  // ── Borders ──────────────────────────────────────────────────────────
  doc.setLineWidth(3); doc.setDrawColor(...theme.borderPrimary);   doc.rect(10, 10, W - 20, H - 20);
  doc.setLineWidth(1); doc.setDrawColor(...theme.borderSecondary); doc.rect(15, 15, W - 30, H - 30);

  doc.setFontSize(34); doc.setFont('helvetica', 'bold'); doc.setTextColor(...theme.titleColor);
  doc.text('Certificate of Achievement', W / 2, 30, { align: 'center' });
  doc.setFontSize(20); doc.setTextColor(...theme.subtitleColor);
  doc.text(`${title} — ${certLevel}`, W / 2, 43, { align: 'center' });

  await addBrandingToPDF({ doc, pageWidth: W, pageHeight: H, footerY: 53, branding, fontSize: 13, textColor: [80, 80, 80] });

  doc.setFontSize(13); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
  doc.text('This certificate is proudly presented to', W / 2, 64, { align: 'center' });

  doc.setFontSize(36); doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
  doc.text(recipientName.trim(), W / 2, 78, { align: 'center' });

  // ── Description ──────────────────────────────────────────────────────
  const descLines: string[] = Array.isArray(description)
    ? description
    : doc.splitTextToSize(description, W - 60);
  doc.setFontSize(12); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60);
  let y = 88;
  descLines.forEach(line => { doc.text(line, W / 2, y, { align: 'center' }); y += 7; });
  const lastDescY = y - 7;

  // ── Score ────────────────────────────────────────────────────────────
  const scoreY = lastDescY + 10;
  doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(...theme.titleColor);
  doc.text(`Overall Score: ${avg.toFixed(1)}/3.0 — ${certLevel}${scoreSuffix ? ` ${scoreSuffix}` : ''}`, W / 2, scoreY, { align: 'center' });

  let competenciesY = scoreY + 10;
  if (excerpt) {
    const excerptY = scoreY + 8;
    doc.setFontSize(11); doc.setFont('helvetica', 'italic'); doc.setTextColor(100, 100, 100);
    doc.text(excerpt, W / 2, excerptY, { align: 'center', maxWidth: W - 40 });
    competenciesY = excerptY + 8;
  }

  // ── Competency grid ──────────────────────────────────────────────────
  doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(50, 50, 50);
  doc.text('Assessment Competencies:', 20, competenciesY);

  const cols = assessmentScores.length <= 4 ? 2 : 3;
  const colW = (W - 40) / cols;
  let yPos = competenciesY + 6;
  let col = 0;
  assessmentScores.forEach(sc => {
    const xPos = 20 + col * colW;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(40, 40, 40);
    doc.text(`${sc.assessment_name}: ${sc.score ?? 0}/3 — ${itemLevelLabel(sc.score)}`, xPos, yPos);
    if (sc.evidence) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(80, 80, 80);
      const lines = doc.splitTextToSize(sc.evidence, colW - 5);
      lines.slice(0, 3).forEach((line: string, li: number) => { doc.text(line, xPos, yPos + 4 + li * 3.5); });
    }
    col++; if (col >= cols) { col = 0; yPos += 22; }
  });

  // ── Footer ───────────────────────────────────────────────────────────
  const footerY = H - 22;
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(130, 130, 130);
  doc.text(`Awarded: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, 20, footerY);
  doc.text(`${branding.institutionName} Programme`, W / 2, footerY, { align: 'center' });
  doc.text(`Certification ID: ${idPrefix}-${makeCertId()}`, W - 20, footerY, { align: 'right' });

  doc.save(`${recipientName.trim().replace(/\s+/g, '-')}-${filenameSuffix}-Certificate.pdf`);
}
