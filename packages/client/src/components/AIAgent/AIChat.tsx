import { useRef, useState, type FormEvent } from 'react';
import type { AIMessage } from '../../hooks/useAI.js';

interface AIChatProps {
  messages: AIMessage[];
  isLoading: boolean;
  onSend: (command: string) => void;
}

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
        style={styles.toggleBtn}
        onClick={() => setIsOpen(true)}
        title="Open AI Assistant"
      >
        AI
      </button>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>AI Assistant</span>
        <button
          style={styles.closeBtn}
          onClick={() => setIsOpen(false)}
          title="Close"
        >
          x
        </button>
      </div>

      <div style={styles.messages}>
        {messages.length === 0 && (
          <div style={styles.placeholder}>
            Ask the AI to create objects, layouts, or modify the board.
            <br /><br />
            Try: "Create a SWOT analysis" or "Add 3 sticky notes with ideas for a project"
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              ...styles.message,
              ...(msg.role === 'user' ? styles.userMessage : {}),
              ...(msg.role === 'error' ? styles.errorMessage : {}),
              ...(msg.role === 'assistant' ? styles.assistantMessage : {}),
            }}
          >
            <div style={styles.messageRole}>
              {msg.role === 'user' ? 'You' : msg.role === 'error' ? 'Error' : 'AI'}
            </div>
            <div style={styles.messageContent}>{msg.content}</div>
          </div>
        ))}
        {isLoading && (
          <div style={{ ...styles.message, ...styles.assistantMessage }}>
            <div style={styles.messageRole}>AI</div>
            <div style={styles.loadingDots}>Thinking...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form style={styles.inputArea} onSubmit={handleSubmit}>
        <input
          style={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isLoading ? 'Waiting for AI...' : 'Ask AI to do something...'}
          disabled={isLoading}
        />
        <button
          type="submit"
          style={{
            ...styles.sendBtn,
            ...(isLoading || !input.trim() ? styles.sendBtnDisabled : {}),
          }}
          disabled={isLoading || !input.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  toggleBtn: {
    position: 'absolute',
    bottom: 80,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: '50%',
    backgroundColor: '#1565C0',
    color: '#fff',
    border: 'none',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
    zIndex: 100,
  },
  container: {
    position: 'absolute',
    bottom: 80,
    right: 16,
    width: 360,
    height: 440,
    backgroundColor: '#fff',
    borderRadius: 12,
    boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 100,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    backgroundColor: '#1565C0',
    color: '#fff',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: 600,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#fff',
    fontSize: 16,
    cursor: 'pointer',
    padding: '2px 6px',
    lineHeight: 1,
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  placeholder: {
    color: '#999',
    fontSize: 13,
    textAlign: 'center',
    padding: '20px 10px',
    lineHeight: 1.5,
  },
  message: {
    padding: '6px 10px',
    borderRadius: 8,
    fontSize: 13,
    lineHeight: 1.4,
    maxWidth: '90%',
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#e3f2fd',
    color: '#1565C0',
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#f5f5f5',
    color: '#333',
  },
  errorMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffebee',
    color: '#c62828',
  },
  messageRole: {
    fontSize: 11,
    fontWeight: 600,
    marginBottom: 2,
    opacity: 0.7,
  },
  messageContent: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  loadingDots: {
    color: '#888',
    fontStyle: 'italic',
  },
  inputArea: {
    display: 'flex',
    gap: 6,
    padding: '8px 10px',
    borderTop: '1px solid #eee',
  },
  input: {
    flex: 1,
    padding: '8px 10px',
    border: '1px solid #ddd',
    borderRadius: 8,
    fontSize: 13,
    outline: 'none',
  },
  sendBtn: {
    padding: '8px 14px',
    backgroundColor: '#1565C0',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  sendBtnDisabled: {
    opacity: 0.5,
    cursor: 'default',
  },
};
