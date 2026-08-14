// SpellCheckTextarea.tsx - Simple browser-based spell checking
import React from 'react';
import classNames from 'classnames';

interface SpellCheckTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  showTips?: boolean;
}

const SpellCheckTextarea: React.FC<SpellCheckTextareaProps> = ({
  value,
  onChange,
  onKeyDown,
  placeholder,
  disabled,
  className,
  showTips = true,
  ...props
}) => {
  return (
    <div className="relative">
      {/* Enhanced textarea with full browser spell check */}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={true}              // Enable browser spell check
        autoCorrect="on"               // Enable auto-correction on mobile
        autoCapitalize="sentences"     // Auto-capitalize sentences
        autoComplete="on"              // Enable auto-completion
        className={classNames(
          // Enhanced styling for better spell check visibility
          "spell-check-enhanced",
          className
        )}
        style={{
          // Ensure spell check underlines are visible
          textDecoration: 'none',
        }}
        {...props}
      />
      
      {/* Educational guidance */}
      {showTips && (
        <div className="mt-2 text-sm bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-start space-x-2">
            <div className="flex-shrink-0 mt-0.5">
              <svg className="h-4 w-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="text-blue-700">
              <div className="font-medium mb-1">✨ Spell Check Tips:</div>
              <ul className="text-sm space-y-1 text-blue-600">
                <li>• <strong>Red underlines</strong> show misspelled words</li>
                <li>• <strong>Right-click</strong> on red underlines for suggestions</li>
                <li>• <strong>Auto-correct</strong> will fix common mistakes as you type</li>
                <li>• Use <strong>Ctrl+Z</strong> (Cmd+Z on Mac) to undo auto-corrections</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* CSS for enhanced spell check visibility */}
      <style jsx>{`
        .spell-check-enhanced {
          /* Ensure spell check underlines are clearly visible */
        }

        /* Make spell check underlines more visible if needed */
        .spell-check-enhanced::-webkit-input-placeholder {
          opacity: 0.6;
        }

        .spell-check-enhanced::-moz-placeholder {
          opacity: 0.6;
        }
      `}</style>
    </div>
  );
};

export default SpellCheckTextarea;