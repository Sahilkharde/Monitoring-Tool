import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Plus, Sparkles, Code2, Briefcase,
  ArrowUp, Bot, User,
} from 'lucide-react';
import clsx from 'clsx';
import { useScanStore } from '../store/scanStore';
import { api } from '../utils/api';

type ChatMode = 'developer' | 'management';

interface AssistantInfo {
  provider: 'gemini' | 'openai' | 'none';
  model: string | null;
  configured: boolean;
  /** Backend will try OpenAI when Gemini hits quota / 429 */
  openai_fallback?: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const DEV_PROMPTS = [
  'What are the top 3 critical security vulnerabilities?',
  'Which performance issues need immediate attention?',
  'What code quality improvements will have the most impact?',
  'Explain the XSS finding and how to fix it',
  'Show me all OWASP findings with remediation steps',
  'Analyze the DRM protection status',
];

const MGMT_PROMPTS = [
  'Give me an executive risk summary',
  'How does our performance compare to industry standards?',
  'Estimate the financial exposure from security findings',
  'What is the business impact of current security issues?',
  'What is the compliance status for OWASP and PCI DSS?',
  'What should be the 30/60/90 day remediation roadmap?',
];

function MarkdownContent({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let codeIdx = 0;

  lines.forEach((line, i) => {
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${codeIdx}`} className="my-2 overflow-x-auto rounded-lg bg-[var(--bg-primary)] p-3 font-mono text-xs text-[var(--text-primary)]">
            {codeLines.join('\n')}
          </pre>
        );
        codeLines = [];
        codeIdx++;
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      return;
    }

    if (line.startsWith('### ')) {
      elements.push(<h4 key={i} className="mb-1 mt-3 text-sm font-bold text-[var(--text-primary)]">{formatInline(line.slice(4))}</h4>);
    } else if (line.startsWith('## ')) {
      elements.push(<h3 key={i} className="mb-1 mt-3 text-base font-bold text-[var(--text-primary)]">{formatInline(line.slice(3))}</h3>);
    } else if (line.startsWith('# ')) {
      elements.push(<h2 key={i} className="mb-2 mt-3 text-lg font-bold text-[var(--text-primary)]">{formatInline(line.slice(2))}</h2>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(<li key={i} className="ml-4 list-disc text-sm text-[var(--text-primary)]">{formatInline(line.slice(2))}</li>);
    } else if (/^\d+\.\s/.test(line)) {
      elements.push(<li key={i} className="ml-4 list-decimal text-sm text-[var(--text-primary)]">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>);
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(<p key={i} className="text-sm leading-relaxed text-[var(--text-primary)]">{formatInline(line)}</p>);
    }
  });

  if (inCodeBlock && codeLines.length > 0) {
    elements.push(
      <pre key={`code-${codeIdx}`} className="my-2 overflow-x-auto rounded-lg bg-[var(--bg-primary)] p-3 font-mono text-xs text-[var(--text-primary)]">
        {codeLines.join('\n')}
      </pre>
    );
  }

  return <div>{elements}</div>;
}

function formatInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*)|(`(.+?)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={match.index} className="font-semibold text-[var(--text-primary)]">{match[2]}</strong>);
    } else if (match[4]) {
      parts.push(<code key={match.index} className="rounded px-1 py-0.5 font-mono text-xs text-blue-300" style={{ backgroundColor: 'rgba(99,102,241,0.12)' }}>{match[4]}</code>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? <>{parts}</> : text;
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-1 py-2">
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: 'var(--text-tertiary)' }}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </div>
  );
}

export default function AIChat() {
  const [mode, setMode] = useState<ChatMode>('developer');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [assistantInfo, setAssistantInfo] = useState<AssistantInfo | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { currentScan } = useScanStore();
  const contextUrl = currentScan?.target_url ?? '';
  const contextScore = currentScan?.overall_score ?? null;

  useEffect(() => {
    api
      .get<AssistantInfo>('/chat/assistant-info')
      .then(setAssistantInfo)
      .catch(() => setAssistantInfo({ provider: 'none', model: null, configured: false }));
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    try {
      const response = await api.post<{ response: string }>('/chat', {
        message: text.trim(),
        mode,
        session_id: sessionId,
        context_url: contextUrl,
        context_score: contextScore,
      });

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.response,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request. Please try again.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    }

    setLoading(false);
  }, [loading, mode, sessionId, contextUrl, contextScore]);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setInput('');
    setSessionId(crypto.randomUUID());
    api
      .get<AssistantInfo>('/chat/assistant-info')
      .then(setAssistantInfo)
      .catch(() => setAssistantInfo({ provider: 'none', model: null, configured: false }));
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }, [input, sendMessage]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  const prompts = mode === 'developer' ? DEV_PROMPTS : MGMT_PROMPTS;
  const isEmpty = messages.length === 0;

  const modelBadge =
    assistantInfo === null
      ? '…'
      : assistantInfo.provider === 'gemini' && assistantInfo.model
        ? `Gemini · ${assistantInfo.model}${assistantInfo.openai_fallback ? ' · OpenAI fallback' : ''}`
        : assistantInfo.provider === 'openai' && assistantInfo.model
          ? `OpenAI · ${assistantInfo.model}`
          : assistantInfo.configured
            ? 'AI'
            : 'No API key';

  return (
    <div className="flex min-h-0 flex-col bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Header */}
      <div className="shrink-0 border-b px-6 py-4" style={{ borderColor: 'var(--border)' }}>
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-400" />
              <h1 className="text-lg font-bold">AI Analysis Assistant</h1>
            </div>
            <span
              className="rounded-md px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)] max-w-[14rem] truncate"
              style={{ backgroundColor: 'rgba(99,102,241,0.12)' }}
              title={assistantInfo?.configured ? 'Backend AI configuration' : 'Add GEMINI_API_KEY or OPENAI_API_KEY in backend/.env and restart the API'}
            >
              {modelBadge}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Context badge */}
            {contextUrl && (
              <div className="hidden items-center gap-1.5 rounded-lg border bg-[var(--bg-card)] px-2.5 py-1 text-xs text-[var(--text-secondary)] sm:flex" style={{ borderColor: 'var(--border)' }}>
                <span className="max-w-[200px] truncate">{contextUrl}</span>
                {contextScore !== null && (
                  <span className={clsx('font-semibold', contextScore >= 80 ? 'text-emerald-400' : contextScore >= 60 ? 'text-yellow-400' : 'text-red-400')}>
                    ({contextScore.toFixed(2)})
                  </span>
                )}
              </div>
            )}
            <button
              onClick={handleNewChat}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              style={{ borderColor: 'var(--border)' }}
            >
              <Plus className="h-4 w-4" />
              New Chat
            </button>
          </div>
        </div>
      </div>

      {/* Mode Tabs */}
      <div className="shrink-0 border-b px-6 py-2" style={{ borderColor: 'var(--border)' }}>
        <div className="mx-auto flex max-w-4xl gap-1">
          <button
            onClick={() => setMode('developer')}
            className={clsx(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              mode === 'developer'
                ? 'bg-blue-500/10 text-blue-400'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            )}
          >
            <Code2 className="h-4 w-4" />
            Developer
          </button>
          <button
            onClick={() => setMode('management')}
            className={clsx(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              mode === 'management'
                ? 'bg-purple-500/10 text-purple-400'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            )}
          >
            <Briefcase className="h-4 w-4" />
            Management
          </button>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-4xl">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Sparkles className="mb-4 h-12 w-12 text-blue-400/50" />
              <h2 className="mb-2 text-2xl font-bold text-[var(--text-primary)]">AI Analysis Assistant</h2>
              <p className="mb-8 max-w-md text-center text-sm text-[var(--text-tertiary)]">
                {mode === 'developer'
                  ? 'Ask technical questions about security vulnerabilities, performance bottlenecks, and code quality issues.'
                  : 'Get executive briefings on risk posture, compliance status, and strategic recommendations.'
                }
              </p>
              <div>
                <p className="mb-3 text-center text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Try asking:</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {prompts.map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(prompt)}
                      className="card rounded-lg px-4 py-3 text-left text-sm text-[var(--text-secondary)] transition-colors hover:border-blue-500/30 hover:text-[var(--text-primary)]"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence>
                {messages.map(msg => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={clsx('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                  >
                    <div className={clsx('flex max-w-[85%] gap-3', msg.role === 'user' && 'flex-row-reverse')}>
                      <div className={clsx(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                        msg.role === 'user' ? 'bg-blue-600' : 'bg-[var(--bg-card)]'
                      )} style={msg.role === 'assistant' ? { border: '1px solid var(--border)' } : undefined}>
                        {msg.role === 'user'
                          ? <User className="h-4 w-4 text-white" />
                          : <Bot className="h-4 w-4 text-[var(--text-secondary)]" />
                        }
                      </div>
                      <div
                        className={clsx(
                          'rounded-2xl px-4 py-3',
                          msg.role === 'user'
                            ? 'text-white'
                            : 'card'
                        )}
                        style={msg.role === 'user' ? { background: 'var(--gradient-primary)' } : undefined}
                      >
                        {msg.role === 'user'
                          ? <p className="text-sm">{msg.content}</p>
                          : <MarkdownContent content={msg.content} />
                        }
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {loading && (
                <div className="flex justify-start">
                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--bg-card)]" style={{ border: '1px solid var(--border)' }}>
                      <Bot className="h-4 w-4 text-[var(--text-secondary)]" />
                    </div>
                    <div className="card rounded-2xl px-4 py-3">
                      <TypingIndicator />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="shrink-0 border-t px-6 py-4" style={{ borderColor: 'var(--border)' }}>
        <div className="mx-auto max-w-4xl">
          <div className="flex items-end gap-3 rounded-xl border bg-[var(--bg-card)] p-3" style={{ borderColor: 'var(--border)' }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder={mode === 'developer'
                ? 'Ask about security, performance, or code quality...'
                : 'Ask about risk posture, compliance, or strategy...'
              }
              rows={1}
              className="max-h-40 flex-1 resize-none bg-transparent text-sm text-[var(--text-primary)] outline-none"
              style={{ color: 'var(--text-primary)' }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className={clsx(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                input.trim() && !loading
                  ? 'text-white'
                  : 'text-[var(--text-tertiary)]'
              )}
              style={input.trim() && !loading
                ? { background: 'var(--gradient-primary)' }
                : { backgroundColor: 'var(--border)' }
              }
            >
              {loading ? <ArrowUp className="h-4 w-4 animate-pulse" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--text-tertiary)]">
            <span>Shift + Enter for new line</span>
            <span>Responses are AI-generated and based on scan data</span>
          </div>
        </div>
      </div>
    </div>
  );
}
