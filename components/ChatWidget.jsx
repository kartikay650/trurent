"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Markdown component overrides tuned for the chat theme. Keeps Claude's rich
// output (bold, lists, tables) readable in the bubble without a heavy stylesheet.
const MD_COMPONENTS = {
  p: ({ node, ...props }) => (
    <p style={{ margin: "0 0 6px 0", lineHeight: 1.6 }} {...props} />
  ),
  strong: ({ node, ...props }) => (
    <strong style={{ color: "var(--text-primary)", fontWeight: 600 }} {...props} />
  ),
  em: ({ node, ...props }) => (
    <em style={{ fontStyle: "italic", color: "var(--text-primary)" }} {...props} />
  ),
  ul: ({ node, ...props }) => (
    <ul style={{ margin: "4px 0 6px 0", paddingLeft: 18 }} {...props} />
  ),
  ol: ({ node, ...props }) => (
    <ol style={{ margin: "4px 0 6px 0", paddingLeft: 18 }} {...props} />
  ),
  li: ({ node, ...props }) => (
    <li style={{ margin: "2px 0", lineHeight: 1.5 }} {...props} />
  ),
  code: ({ node, inline, ...props }) =>
    inline ? (
      <code
        style={{
          fontFamily: "var(--font-dm-mono), monospace",
          fontSize: "0.92em",
          background: "rgba(255,255,255,0.06)",
          padding: "1px 5px",
          borderRadius: 3,
        }}
        {...props}
      />
    ) : (
      <pre
        style={{
          fontFamily: "var(--font-dm-mono), monospace",
          fontSize: 12,
          background: "rgba(255,255,255,0.04)",
          padding: 8,
          borderRadius: 6,
          overflowX: "auto",
        }}
      >
        <code {...props} />
      </pre>
    ),
  table: ({ node, ...props }) => (
    <div style={{ overflowX: "auto", margin: "6px 0" }}>
      <table
        style={{
          borderCollapse: "collapse",
          fontSize: 12,
          width: "100%",
        }}
        {...props}
      />
    </div>
  ),
  thead: ({ node, ...props }) => <thead {...props} />,
  tbody: ({ node, ...props }) => <tbody {...props} />,
  tr: ({ node, ...props }) => (
    <tr
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
      {...props}
    />
  ),
  th: ({ node, ...props }) => (
    <th
      style={{
        textAlign: "left",
        padding: "4px 8px 4px 0",
        color: "var(--text-tertiary)",
        fontWeight: 500,
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
      }}
      {...props}
    />
  ),
  td: ({ node, ...props }) => (
    <td
      style={{
        padding: "4px 8px 4px 0",
        color: "var(--text-secondary)",
        verticalAlign: "top",
      }}
      {...props}
    />
  ),
  a: ({ node, ...props }) => (
    <a
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: "var(--accent-primary)", textDecoration: "underline" }}
      {...props}
    />
  ),
  h1: ({ node, ...props }) => (
    <div
      style={{
        fontSize: 14,
        fontWeight: 600,
        color: "var(--text-primary)",
        margin: "6px 0 4px",
      }}
      {...props}
    />
  ),
  h2: ({ node, ...props }) => (
    <div
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: "var(--text-primary)",
        margin: "6px 0 4px",
      }}
      {...props}
    />
  ),
  h3: ({ node, ...props }) => (
    <div
      style={{
        fontSize: 12,
        fontWeight: 600,
        color: "var(--text-primary)",
        margin: "6px 0 4px",
      }}
      {...props}
    />
  ),
  hr: () => (
    <hr
      style={{
        border: "none",
        borderTop: "1px solid var(--border-subtle)",
        margin: "8px 0",
      }}
    />
  ),
};

const ONBOARDING_MESSAGE =
  "Hey! I'm here to help you find your Bangalore flat. Where do you work, or what part of town do you have in mind? I'll search and show you real options on the map.";

const TOOL_LABEL = {
  search_listings: "Searching listings",
  get_listing_details: "Loading listing details",
};

const STORAGE_KEY = "trurent_chat_v1";
const SUGGESTIONS = [
  "I work at Manyata, find me a 1-2 BHK under 25k",
  "Cheapest zero-brokerage flats",
  "Compare 3 premium 3BHK options in Indiranagar",
];

export default function ChatWidget({ onFiltersUpdate, forceCollapsed = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const scrollAnchorRef = useRef(null);
  const onFiltersUpdateRef = useRef(onFiltersUpdate);

  const effectiveOpen = isOpen && !forceCollapsed;

  useEffect(() => {
    onFiltersUpdateRef.current = onFiltersUpdate;
  }, [onFiltersUpdate]);

  // Hydrate from localStorage AFTER mount so SSR-rendered HTML matches the first
  // client paint (no hydration mismatch).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed?.messages)) setMessages(parsed.messages);
        if (typeof parsed?.isOpen === "boolean") setIsOpen(parsed.isOpen);
      }
    } catch {
      /* corrupt or absent — fall through to defaults */
    }
    setHydrated(true);
  }, []);

  // Persist on every meaningful change. Only after hydration so we don't clobber
  // saved state with the initial empty defaults.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ messages, isOpen }),
      );
    } catch {
      /* quota exceeded or storage disabled — silently skip */
    }
  }, [messages, isOpen, hydrated]);

  // Onboarding only fires on a truly fresh visit (no saved messages).
  useEffect(() => {
    if (!hydrated) return;
    if (messages.length > 0) return;
    const t = setTimeout(() => {
      setIsOpen(true);
      setMessages((m) =>
        m.length === 0
          ? [{ role: "assistant", content: [{ type: "text", text: ONBOARDING_MESSAGE }] }]
          : m,
      );
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  useEffect(() => {
    if (!effectiveOpen) return;
    scrollAnchorRef.current?.scrollIntoView({ block: "end" });
  }, [messages, isLoading, effectiveOpen]);

  // ---- Append into the current (in-progress) assistant message's content array. ----
  // The assistant message is always the LAST entry while isLoading; we mutate-by-replace
  // its content array so React re-renders.
  function appendToLastAssistant(updater) {
    setMessages((prev) => {
      const next = prev.slice();
      const i = next.length - 1;
      if (i < 0 || next[i].role !== "assistant") return prev;
      const blocks = Array.isArray(next[i].content) ? next[i].content.slice() : [];
      const updated = updater(blocks);
      next[i] = { ...next[i], content: updated };
      return next;
    });
  }

  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMsg = { role: "user", content: trimmed };

    // Send a CLEAN text-only history to the API. Our UI assistant messages carry
    // tool-call pill blocks for rendering, but the API only accepts Anthropic's
    // canonical block shapes — and the agent doesn't need to see prior tool_use
    // blocks anyway; the user's text intent is the source of truth.
    const apiHistory = [...messages, userMsg]
      .map((m) => {
        if (m.role === "user") {
          return {
            role: "user",
            content: typeof m.content === "string" ? m.content : "",
          };
        }
        let text = "";
        if (typeof m.content === "string") text = m.content;
        else if (Array.isArray(m.content)) {
          text = m.content
            .filter((b) => b.type === "text" && b.text)
            .map((b) => b.text)
            .join("\n")
            .trim();
        }
        return { role: "assistant", content: text };
      })
      .filter((m) => m.content);

    // UI state: append user msg + empty assistant placeholder we fill as events arrive.
    setMessages((prev) => [
      ...prev,
      userMsg,
      { role: "assistant", content: [] },
    ]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiHistory }),
      });

      if (!res.ok || !res.body) {
        appendToLastAssistant((blocks) => [
          ...blocks,
          { type: "text", text: "Something went wrong, try again." },
        ]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;
          let evt;
          try {
            evt = JSON.parse(trimmedLine);
          } catch {
            continue;
          }
          handleEvent(evt);
        }
      }
    } catch {
      appendToLastAssistant((blocks) => [
        ...blocks,
        { type: "text", text: "Something went wrong, try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleEvent(evt) {
    switch (evt.type) {
      case "text_delta": {
        // Append the streaming text to the current text block (or start a new one).
        appendToLastAssistant((blocks) => {
          const last = blocks[blocks.length - 1];
          if (last && last.type === "text") {
            return [
              ...blocks.slice(0, -1),
              { ...last, text: (last.text || "") + evt.text },
            ];
          }
          return [...blocks, { type: "text", text: evt.text }];
        });
        return;
      }
      case "tool_use_start": {
        appendToLastAssistant((blocks) => [
          ...blocks,
          {
            type: "tool",
            id: evt.id,
            name: evt.name,
            status: "pending",
            label: TOOL_LABEL[evt.name] || `Running ${evt.name}`,
          },
        ]);
        return;
      }
      case "tool_result": {
        appendToLastAssistant((blocks) =>
          blocks.map((b) =>
            b.type === "tool" && b.id === evt.tool_use_id
              ? { ...b, status: "complete", summary: evt.summary }
              : b,
          ),
        );
        return;
      }
      case "filters_update": {
        // Tell the page: replace filters with what the agent just searched for.
        onFiltersUpdateRef.current?.(evt.filters, { replace: true });
        return;
      }
      case "assistant_turn_complete":
        // Server signals one completed turn within the agent loop. Nothing to do for
        // rendering — we already streamed the deltas. Not needed for history either:
        // we strip down to text on the next send (see sendMessage / apiHistory).
        return;
      case "turn_summary": {
        // Stash usage telemetry on the in-progress assistant message so the UI
        // can render a small footer (tokens, latency, tool calls).
        setMessages((prev) => {
          const next = prev.slice();
          const i = next.length - 1;
          if (i < 0 || next[i].role !== "assistant") return prev;
          next[i] = {
            ...next[i],
            summary: {
              tokensIn: evt.tokens_in,
              tokensOut: evt.tokens_out,
              latencyMs: evt.latency_ms,
              toolCalls: evt.tool_calls,
            },
          };
          return next;
        });
        return;
      }
      case "error": {
        appendToLastAssistant((blocks) => [
          ...blocks,
          { type: "text", text: evt.message || "Something went wrong." },
        ]);
        return;
      }
      case "done":
        return;
      default:
        return;
    }
  }


  const sendDisabled = input.trim() === "" || isLoading;

  return (
    <>
      <style>{`
        .trurent-chat-scroll::-webkit-scrollbar { width: 3px; }
        .trurent-chat-scroll::-webkit-scrollbar-track { background: transparent; }
        .trurent-chat-scroll::-webkit-scrollbar-thumb {
          background: var(--border-strong);
          border-radius: 2px;
        }
        @keyframes trurent-pulse {
          0%, 80%, 100% { opacity: 0.2; }
          40% { opacity: 1; }
        }
        @keyframes trurent-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes trurent-chat-open {
          from { opacity: 0; transform: scale(0.95); }
          to   { opacity: 1; transform: scale(1); }
        }
        .trurent-input {
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 13px;
          font-family: var(--font-dm-sans), sans-serif;
          color: var(--text-primary);
          flex: 1;
          min-width: 0;
          outline: none;
          transition: border-color 150ms ease;
        }
        .trurent-input::placeholder { color: var(--text-tertiary); }
        .trurent-input:focus { border-color: var(--border-strong); }
        .trurent-send-btn { transition: background 150ms ease; }
        .trurent-send-btn:hover:not(:disabled) { background: var(--accent-hover); }
        .trurent-send-btn:disabled {
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          cursor: not-allowed;
        }
        .trurent-fab { transition: background 150ms ease, border-color 150ms ease; }
        .trurent-fab:hover {
          background: var(--bg-elevated);
          border-color: var(--border-strong);
        }
        .trurent-suggestion {
          transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
        }
        .trurent-suggestion:hover {
          background: var(--bg-surface);
          border-color: var(--border-default);
          color: var(--text-primary);
        }
        .trurent-tool-spinner {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          border: 1.5px solid var(--text-tertiary);
          border-top-color: var(--text-primary);
          animation: trurent-spin 700ms linear infinite;
          vertical-align: middle;
          flex-shrink: 0;
        }
        @media (max-width: 768px) {
          .trurent-chat-panel {
            width: calc(100vw - 32px) !important;
            height: 420px !important;
          }
        }
      `}</style>

      {!effectiveOpen && (
        <button
          className="trurent-fab"
          onClick={() => setIsOpen(true)}
          aria-label="Open chat"
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 40,
            width: 52,
            height: 52,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "50%",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            fontFamily: "inherit",
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="var(--text-primary)"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          >
            <path d="M 4 4 Q 4 2 6 2 L 14 2 Q 16 2 16 4 L 16 11 Q 16 13 14 13 L 8 13 L 5 16 L 5 13 L 6 13 Q 4 13 4 11 Z" />
          </svg>

          {messages.length > 0 && !effectiveOpen && (
            <span
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "var(--accent-glow)",
                border: "2px solid var(--bg-surface)",
                boxSizing: "content-box",
              }}
            />
          )}
        </button>
      )}

      {effectiveOpen && (
        <div
          className="trurent-chat-panel"
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 40,
            width: 360,
            height: 480,
            background: "rgba(255, 255, 255, 0.86)",
            backdropFilter: "blur(24px) saturate(140%)",
            WebkitBackdropFilter: "blur(24px) saturate(140%)",
            border: "1px solid var(--border-default)",
            borderRadius: 12,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            transformOrigin: "bottom right",
            animation: "trurent-chat-open 200ms ease forwards",
            fontFamily: "var(--font-dm-sans), sans-serif",
          }}
        >
          {/* Left accent bar */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 3,
              background: "var(--accent-primary)",
              pointerEvents: "none",
            }}
          />

          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              padding: "16px 16px 16px 20px",
              gap: 12,
              flex: "0 0 auto",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  letterSpacing: "-0.01em",
                }}
              >
                TruRent agent
              </div>
              <div
                style={{
                  marginTop: 2,
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                }}
              >
                Searches the map for you
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
              style={{
                flex: "0 0 auto",
                width: 28,
                height: 28,
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 6,
                color: "var(--text-secondary)",
                fontSize: 16,
                lineHeight: 1,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                fontFamily: "inherit",
              }}
            >
              ×
            </button>
          </div>

          <div
            style={{
              height: 1,
              background: "var(--border-subtle)",
              marginLeft: 20,
            }}
          />

          {/* Messages */}
          <div
            className="trurent-chat-scroll"
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 16,
              paddingLeft: 20,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {messages.map((m, i) => renderMessage(m, i))}

            {/* Typing dots: only when loading AND the in-progress assistant turn has no
                content yet. As soon as any text/tool block appears, dots go away. */}
            {isLoading && shouldShowTypingDots(messages) && (
              <div
                style={{
                  alignSelf: "flex-start",
                  padding: "2px 0",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                }}
              >
                {[0, 0.2, 0.4].map((delay, idx) => (
                  <span
                    key={idx}
                    style={{
                      display: "inline-block",
                      width: 4,
                      height: 4,
                      borderRadius: "50%",
                      background: "var(--text-tertiary)",
                      margin: "0 2px",
                      animation: `trurent-pulse 1.2s ease-in-out infinite`,
                      animationDelay: `${delay}s`,
                      verticalAlign: "middle",
                    }}
                  />
                ))}
              </div>
            )}

            <div ref={scrollAnchorRef} />
          </div>

          {/* Cold-start suggestion chips — only when there's no real conversation yet */}
          {messages.length <= 1 && !isLoading && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                padding: "0 16px 8px 20px",
                flex: "0 0 auto",
              }}
            >
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => sendMessage(s)}
                  className="trurent-suggestion"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 14,
                    padding: "5px 10px",
                    fontSize: 11,
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    letterSpacing: "-0.01em",
                    textAlign: "left",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input area */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 16px",
              paddingLeft: 20,
              borderTop: "1px solid var(--border-subtle)",
              flex: "0 0 auto",
            }}
          >
            <input
              className="trurent-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
              placeholder="2BHK in Indiranagar under ₹30k…"
            />
            <button
              type="submit"
              className="trurent-send-btn"
              disabled={sendDisabled}
              aria-label="Send"
              style={{
                width: 36,
                height: 36,
                background: "var(--accent-primary)",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                flex: "0 0 auto",
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M 3 7 L 11 7 M 7 3 L 11 7 L 7 11" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}

// ---- Rendering helpers ----

function shouldShowTypingDots(messages) {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return false;
  const c = last.content;
  if (typeof c === "string") return false;
  if (!Array.isArray(c)) return true;
  return c.length === 0;
}

function renderMessage(m, key) {
  if (m.role === "user") {
    // Hide user messages whose content is an array of tool_result blocks (internal only).
    if (typeof m.content !== "string") return null;
    return (
      <div
        key={key}
        style={{
          alignSelf: "flex-end",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          borderRadius: "12px 12px 2px 12px",
          padding: "8px 12px",
          maxWidth: "80%",
          fontSize: 13,
          color: "var(--text-primary)",
          lineHeight: 1.45,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {m.content}
      </div>
    );
  }

  // Assistant. Content can be a string (onboarding) or an array of blocks.
  const blocks = Array.isArray(m.content)
    ? m.content
    : [{ type: "text", text: m.content }];

  return (
    <div
      key={key}
      style={{
        alignSelf: "stretch",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {blocks.map((b, j) => {
        if (b.type === "text") {
          if (!b.text) return null;
          return (
            <div
              key={j}
              style={{
                alignSelf: "flex-start",
                background: "transparent",
                border: "none",
                padding: "2px 0",
                maxWidth: "95%",
                fontSize: 13,
                color: "var(--text-secondary)",
                lineHeight: 1.6,
                wordBreak: "break-word",
              }}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                {b.text}
              </ReactMarkdown>
            </div>
          );
        }
        if (b.type === "tool") {
          const pending = b.status !== "complete";
          return (
            <div
              key={j}
              style={{
                alignSelf: "flex-start",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 6,
                padding: "5px 10px",
                fontSize: 11,
                color: pending ? "var(--text-secondary)" : "var(--text-tertiary)",
                fontFamily: "var(--font-dm-mono), monospace",
                letterSpacing: "-0.01em",
              }}
            >
              {pending ? (
                <span className="trurent-tool-spinner" />
              ) : (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--accent-primary)",
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
              )}
              <span>
                {pending
                  ? `${b.label}…`
                  : `${b.label} · ${b.summary || "done"}`}
              </span>
            </div>
          );
        }
        return null;
      })}

      {/* Per-turn telemetry footer: tokens, latency, tool calls. AI-engineer signal. */}
      {m.summary && (
        <div
          style={{
            alignSelf: "flex-start",
            marginTop: 2,
            fontSize: 10,
            color: "var(--text-tertiary)",
            fontFamily: "var(--font-dm-mono), monospace",
            letterSpacing: "-0.01em",
          }}
        >
          {(m.summary.tokensIn + m.summary.tokensOut).toLocaleString()} tokens ·{" "}
          {(m.summary.latencyMs / 1000).toFixed(1)}s ·{" "}
          {m.summary.toolCalls} {m.summary.toolCalls === 1 ? "tool call" : "tool calls"}
        </div>
      )}
    </div>
  );
}
