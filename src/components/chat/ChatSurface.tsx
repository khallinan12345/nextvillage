// ChatSurface.tsx - shared conversational UI frame for nextVillage chat pages.
//
// Implements the "nextVillage chat aesthetics" protocol: one bordered frame
// holds transcript + composer, the assistant gets no bubble (it's the thing
// being read), only the learner's own words get a card, and violet is the
// only accent color used anywhere in the frame.
import React, { ReactNode } from 'react';
import classNames from 'classnames';
import { Send } from 'lucide-react';
import SpellCheckTextarea from '../ui/SpellCheckTextarea';

export interface ChatSurfaceMessage {
  role: 'assistant' | 'user';
  content: string;
  timestamp?: Date;
}

interface ChatSurfaceProps {
  title?: string;
  legend?: ReactNode;
  messages: ChatSurfaceMessage[];
  renderAssistant: (content: string, index: number) => ReactNode;
  submitting?: boolean;
  transcriptRef?: React.Ref<HTMLDivElement>;
  transcriptHeightClassName?: string;

  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  notice?: ReactNode;

  composerActions?: ReactNode;
  sessionActions?: ReactNode;
}

const ChatSurface: React.FC<ChatSurfaceProps> = ({
  title,
  legend,
  messages,
  renderAssistant,
  submitting,
  transcriptRef,
  transcriptHeightClassName = 'h-80',
  value,
  onChange,
  onKeyDown,
  onSubmit,
  placeholder = 'Type your response here…',
  disabled,
  notice,
  composerActions,
  sessionActions,
}) => {
  return (
    <div className="rounded-2xl border border-hair bg-surface shadow-sm overflow-hidden">
      {(title || legend) && (
        <div className="px-5 py-3 border-b border-hair flex items-center justify-between flex-wrap gap-2">
          {title && <h3 className="text-base font-semibold text-ink">{title}</h3>}
          {legend}
        </div>
      )}

      <div
        ref={transcriptRef}
        className={classNames('px-5 py-5 space-y-7 overflow-y-auto', transcriptHeightClassName)}
      >
        {messages.map((message, index) => (
          <div
            key={index}
            className={classNames('flex flex-col', message.role === 'user' ? 'items-end' : 'items-start')}
          >
            <span className="text-xs font-medium text-muted mb-1.5">
              {message.role === 'user' ? 'You' : 'AI Coach'}
            </span>
            {message.role === 'user' ? (
              <div className="max-w-[42rem] rounded-xl bg-card border border-hair px-4 py-3 text-body text-[15px] leading-[1.7]">
                {message.content}
              </div>
            ) : (
              <div className="max-w-[42rem] w-full text-body text-[15px] leading-[1.7]">
                {renderAssistant(message.content, index)}
              </div>
            )}
          </div>
        ))}

        {submitting && (
          <div className="flex flex-col items-start">
            <span className="text-xs font-medium text-muted mb-1.5">AI Coach</span>
            <div className="flex gap-1 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-muted animate-pulse" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted animate-pulse" style={{ animationDelay: '0.2s' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-muted animate-pulse" style={{ animationDelay: '0.4s' }} />
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-hair bg-card px-5 py-4">
        {notice}
        <div className="relative">
          <SpellCheckTextarea
            value={value}
            onChange={onChange}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            showTips={false}
            className="w-full bg-transparent text-body text-[15px] leading-[1.7] resize-none h-24 pr-28 focus:outline-none placeholder:text-muted"
          />
          <button
            type="button"
            onClick={onSubmit}
            disabled={disabled || !value.trim()}
            className="absolute bottom-2.5 right-1 inline-flex items-center gap-1.5 rounded-full bg-accent text-white px-4 py-2 text-sm font-semibold hover:bg-accent/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            <Send size={14} />
            Submit
          </button>
        </div>

        {composerActions && (
          <div className="mt-3 flex flex-wrap items-center gap-2">{composerActions}</div>
        )}

        {sessionActions && (
          <div className="mt-3 pt-3 border-t border-hair flex flex-wrap items-center justify-end gap-2">
            {sessionActions}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatSurface;
