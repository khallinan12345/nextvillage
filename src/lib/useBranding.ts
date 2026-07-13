/**
 * useBranding — shared branding hook for all certification pages.
 *
 * Resolves the correct organisation name, logo path, and PDF helpers
 * based on the signed-in user's profiles.organization_id.
 *
 * Priority (org-id match wins; vai is the default for all unaffiliated users):
 * 1. NPower org                  → NPower branding
 * 2. 100 Black Girls in STEM org → Girls AI-ing branding
 * 3. Solardero org               → Solardero branding
 * 4. Oloibiri (Davidson) org     → Oloibiri/vAI branding
 * 5. Everyone else               → vAI branding (default)
 *
 * isAfrica (continent === 'Africa') is kept separate for UI logic
 * such as showing English steps — it is NOT tied to branding variant.
 */

import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { useAuth } from '../hooks/useAuth';

// ─── Organisation constants ────────────────────────────────────────────────────

export const NPOWER_ORG_ID    = 'cd0fc311-2194-485f-b8f4-e3d69022fcde';
export const BGS100_ORG_ID    = 'c0b48eae-67af-449d-8c04-cc6950bf0982';
export const SOLARDERO_ORG_ID = 'a1b2c3d4-0002-0002-0002-000000000002';
export const OLOIBIRI_ORG_ID  = 'a1b2c3d4-0001-0001-0001-000000000001';

// ─── Branding types ────────────────────────────────────────────────────────────

export type BrandingVariant = 'npower' | 'girls-ai-ing' | 'solardero' | 'oloibiri' | 'vai';

export interface Branding {
  variant: BrandingVariant;
  institutionName: string;
  shortName: string;
  logoPathLight: string | null;
  logoPath: string | null;
  textColor: string;
  isReady: boolean;
}

// ─── Branding map ──────────────────────────────────────────────────────────────

const BRANDING_MAP: Record<BrandingVariant, Omit<Branding, 'isReady'>> = {
  npower: {
    variant: 'npower',
    institutionName: 'NPower',
    shortName: 'NPower',
    logoPath: '/npower-logo.svg',
    logoPathLight: '/npower-logo.svg',
    textColor: 'text-blue-700',
  },
  'girls-ai-ing': {
    variant: 'girls-ai-ing',
    institutionName: 'Girls AI-ing',
    shortName: 'Girls AI-ing',
    logoPath: null,
    logoPathLight: null,
    textColor: 'text-pink-600',
  },
  solardero: {
    variant: 'solardero',
    institutionName: 'Solardero',
    shortName: 'Solardero',
    logoPath: '/solardero_logo.jpg',
    logoPathLight: '/solardero_logo.jpg',
    textColor: 'text-yellow-600',
  },
  oloibiri: {
    variant: 'oloibiri',
    institutionName: 'vAI — Davidson AI Innovation Center',
    shortName: 'vAI',
    logoPath: '/VAI_logo.jpeg',
    logoPathLight: '/VAI_logo.jpeg',
    textColor: 'text-teal-600',
  },
  vai: {
    variant: 'vai',
    institutionName: 'vAI — Davidson AI Innovation Center',
    shortName: 'vAI',
    logoPath: '/VAI_logo.jpeg',
    logoPathLight: '/VAI_logo.jpeg',
    textColor: 'text-teal-600',
  },
};

// ─── Resolve variant from profile data ────────────────────────────────────────

export const resolveVariant = (
  organizationId: string | null,
): BrandingVariant => {
  if (organizationId === NPOWER_ORG_ID)    return 'npower';
  if (organizationId === BGS100_ORG_ID)    return 'girls-ai-ing';
  if (organizationId === SOLARDERO_ORG_ID) return 'solardero';
  if (organizationId === OLOIBIRI_ORG_ID)  return 'oloibiri';
  return 'vai';
};

// ─── React hook ───────────────────────────────────────────────────────────────

export const useBranding = (): Branding => {
  const { user } = useAuth();
  const [variant, setVariant] = useState<BrandingVariant>('vai');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!user?.id) { setIsReady(true); return; }

    supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.warn('[useBranding] profile fetch error:', error.message);
          setIsReady(true);
          return;
        }
        console.log('[useBranding] organization_id:', data?.organization_id);
        setVariant(resolveVariant(data?.organization_id ?? null));
        setIsReady(true);
      })
      .catch((e) => { console.warn('[useBranding] catch:', e); setIsReady(true); });
  }, [user?.id]);

  return { ...BRANDING_MAP[variant], isReady };
};

// ─── PDF helper ───────────────────────────────────────────────────────────────

interface PDFBrandingOptions {
  doc: any;
  pageWidth: number;
  pageHeight: number;
  footerY: number;
  branding: Branding;
  fontSize?: number;
  textColor?: [number, number, number];
}

export const addBrandingToPDF = async (options: PDFBrandingOptions): Promise<void> => {
  const { doc, pageWidth, footerY, branding, fontSize = 28, textColor = [138, 43, 226] } = options;

  if (branding.logoPath) {
    try {
      const resp = await fetch(branding.logoPath);
      if (resp.ok) {
        const blob = await resp.blob();
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        const logoW = 50, logoH = 17;
        const logoX = (pageWidth - logoW) / 2;
        const logoY = footerY - logoH - 2;
        let ext = 'PNG';
        const lowerPath = branding.logoPath.toLowerCase();
        if (lowerPath.endsWith('.svg')) ext = 'SVG';
        else if (lowerPath.endsWith('.jpg') || lowerPath.endsWith('.jpeg')) ext = 'JPEG';
        else if (lowerPath.endsWith('.webp')) ext = 'WEBP';
        doc.addImage(base64, ext, logoX, logoY, logoW, logoH);
      }
    } catch (err) {
      console.warn('[Certificate] Logo failed to load:', err);
    }
  }

  doc.setFontSize(fontSize);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...textColor);
  doc.text(branding.institutionName, pageWidth / 2, footerY, { align: 'center' });
};
