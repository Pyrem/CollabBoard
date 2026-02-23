import { useRef, useState, type FormEvent } from 'react';
import type { AIMessage } from '../../hooks/useAI.js';

/**
 * Props for the {@link AIChat} component.
 *
 * @property messages - Full conversation history from {@link useAI}.
 * @property isLoading - `true` while an AI request is in-flight (disables input).
 * @property onSend - Callback invoked with the trimmed user command string.
 */
interface AIChatProps {
  messages: AIMessage[];
  isLoading: boolean;
  onSend: (command: string) => void;
}

const messageBase = 'px-2.5 py-1.5 rounded-lg text-[13px] leading-snug max-w-[90%]';

/**
 * Collapsible chat panel for sending natural-language commands to the AI agent.
 *
 * **Collapsed state** — renders a small "AI" FAB (bottom-right).
 * **Expanded state** — a 360×440 px panel with:
 * - A scrollable message list (user / assistant / error bubbles).
 * - A "Thinking..." indicator while the AI is processing.
 * - An input + send button form at the bottom.
 *
 * The panel auto-scrolls to the latest message after each send.
 *
 * @see {@link useAI} for the hook that manages conversation state.
 */
export function AIChat({ messages, isLoading, onSend }: AIChatProps): React.JSX.Element {
  const [input, setInput] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setInput('');
    // Scroll to bottom after message is added
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  if (!isOpen) {
    return (
      <button
        className="absolute bottom-20 right-4 w-12 h-12 rounded-full bg-warm-800 text-white border-none text-base font-bold cursor-pointer shadow-lg z-[100] hover:bg-warm-900"
        onClick={() => setIsOpen(true)}
        title="Open AI Assistant"
      >
        AI
      </button>
    );
  }

  return (
    <div className="absolute bottom-20 right-4 w-[360px] h-[440px] bg-warm-50 rounded-xl shadow-xl flex flex-col z-[100] overflow-hidden border border-warm-200">
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-warm-800 text-white">
        <span className="text-sm font-semibold">AI Assistant</span>
        <button
          className="bg-transparent border-none text-white text-base cursor-pointer px-1.5 py-0.5 leading-none hover:opacity-80"
          onClick={() => setIsOpen(false)}
          title="Close"
        >
          x
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 py-2 flex flex-col gap-1.5">
        {messages.length === 0 && (
          <div className="text-warm-400 text-[13px] text-center px-2.5 py-5 leading-relaxed">
            Ask the AI to create objects, layouts, or modify the board.
            <br /><br />
            Try: &quot;Create a SWOT analysis&quot; or &quot;Add 3 sticky notes with ideas for a project&quot;
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`${messageBase} ${
              msg.role === 'user'
                ? 'self-end bg-amber-light text-warm-800'
                : msg.role === 'error'
                  ? 'self-start bg-red-50 text-red-800'
                  : 'self-start bg-warm-100 text-warm-700'
            }`}
          >
            <div className="text-[11px] font-semibold mb-0.5 opacity-70">
              {msg.role === 'user' ? 'You' : msg.role === 'error' ? 'Error' : 'AI'}
            </div>
            <div className="whitespace-pre-wrap break-words">{msg.content}</div>
          </div>
        ))}
        {isLoading && (
          <div className={`${messageBase} self-start bg-warm-100 text-warm-700`}>
            <div className="text-[11px] font-semibold mb-0.5 opacity-70">AI</div>
            <div className="text-warm-400 italic">Thinking...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="flex gap-1.5 px-2.5 py-2 border-t border-warm-200" onSubmit={handleSubmit}>
        <input
          className="flex-1 px-2.5 py-2 border border-warm-300 rounded-lg text-[13px] outline-none focus:border-amber-accent bg-white text-warm-800 placeholder:text-warm-400"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isLoading ? 'Waiting for AI...' : 'Ask AI to do something...'}
          disabled={isLoading}
        />
        <button
          type="submit"
          className={`px-3.5 py-2 bg-amber-accent text-white border-none rounded-lg text-[13px] font-semibold cursor-pointer hover:bg-amber-hover ${
            isLoading || !input.trim() ? 'opacity-50 cursor-default' : ''
          }`}
          disabled={isLoading || !input.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}
