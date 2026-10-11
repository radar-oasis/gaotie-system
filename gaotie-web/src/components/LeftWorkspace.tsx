import ChatStream from './ChatStream';
import InputArea from './InputArea';
import './CulturalTheme.css';

export default function LeftWorkspace({ onSendMessage }: { onSendMessage: (content: string) => void }) {
  return <main className="theme-workspace">
    <h1>文化主题解读</h1>
    <ChatStream />
    <InputArea onSendMessage={onSendMessage} />
  </main>;
}
