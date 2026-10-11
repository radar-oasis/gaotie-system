import { useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUpIcon } from 'tdesign-icons-react';
import { useChat } from '../context/ChatContext';

export default function InputArea({ onSendMessage }: { onSendMessage: (content: string) => void }) {
  const [input, setInput] = useState('');
  const { isInputting } = useChat();
  const composing = useRef(false);
  const submit = () => {
    if (!input.trim() || isInputting) return;
    onSendMessage(input.trim());
    setInput('');
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) {
      event.preventDefault();
      submit();
    }
  };
  return <div className="theme-input">
    <form className="pattern-composer__input workspace-composer" onSubmit={event => { event.preventDefault(); submit(); }}>
      <textarea aria-label="文化主题消息" placeholder="继续聊聊你的想法…" rows={2} maxLength={4000}
        value={input} onChange={event => setInput(event.target.value)} disabled={isInputting} onKeyDown={keyDown}
        onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} />
      <button type="submit" className="pattern-send workspace-send" aria-label="发送消息" title="发送（Enter）" disabled={isInputting || !input.trim()}>
        {isInputting ? <span className="pattern-spinner" /> : <ArrowUpIcon size={22} />}
      </button>
    </form>
  </div>;
}
