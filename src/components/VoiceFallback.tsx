/**
 * VoiceFallback
 *
 * Renders the text that would have been spoken when TTS is unavailable
 * (e.g. no network to download cloud voices, or unsupported browser).
 *
 * Usage:
 *   import { VoiceFallback } from '../components/VoiceFallback';
 *
 *   const { speak, fallbackText, clearFallback } = useVoice(isAfrica);
 *
 *   <VoiceFallback text={fallbackText} onDismiss={clearFallback} />
 */

import React from 'react';
import { Volume2, X } from 'lucide-react';

interface VoiceFallbackProps {
  text: string | null;
  onDismiss?: () => void;
  /** Extra classes on the outer container */
  className?: string;
}

export const VoiceFallback: React.FC<VoiceFallbackProps> = ({
  text,
  onDismiss,
  className = '',
}) => {
  if (!text) return null;

  return (
    <div
      className={`flex items-start gap-3 bg-amber-50 border border-amber-200 
                  rounded-xl px-4 py-3 shadow-xs animate-fade-in ${className}`}
      role="status"
      aria-live="polite"
    >
      {/* Icon */}
      <div className="flex-shrink-0 mt-0.5 w-7 h-7 rounded-full bg-amber-100 
                      flex items-center justify-center">
        <Volume2 size={14} className="text-amber-600" />
      </div>

      {/* Text */}
      <p className="flex-1 text-sm text-amber-900 leading-relaxed">{text}</p>

      {/* Dismiss */}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="flex-shrink-0 mt-0.5 text-amber-400 hover:text-amber-700 
                     transition-colors"
          aria-label="Dismiss"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
};

export default VoiceFallback;
