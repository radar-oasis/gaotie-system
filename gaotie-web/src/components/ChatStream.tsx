import { useEffect, useRef } from 'react';
import { useChat } from '../context/ChatContext';
import ChatMessageItem from './ChatMessageItem';

export default function ChatStream() {
  const { chatHistory, isInputting } = useChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [chatHistory, isInputting]);
  return <div ref={scrollRef} className="theme-stream" role="log" aria-label="文化主题对话" aria-live="polite">
    {!chatHistory.length && <div className="theme-empty">想从什么文化主题开始？</div>}
    {chatHistory.map(message => <ChatMessageItem key={message.id} message={message} />)}
    {isInputting && <div className="theme-waiting" role="status"><span className="pattern-spinner" />正在回复…</div>}
  </div>;
}
