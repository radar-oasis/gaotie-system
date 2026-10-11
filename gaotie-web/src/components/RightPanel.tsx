import { ArrowRightIcon } from 'tdesign-icons-react';
import { useChat } from '../context/ChatContext';
import SelectedTagsList from './SelectedTagsList';

export default function RightPanel({ onConfirm }: { onConfirm: () => void }) {
  const { selectedTags } = useChat();
  return <aside className="pattern-selected theme-selected" aria-label="已选意象">
    <header><h2>已选意象</h2><span className="pattern-selected__count" aria-live="polite">{selectedTags.length}</span></header>
    <SelectedTagsList />
    <button type="button" className="pattern-selected__confirm" aria-label="查找纹样" disabled={!selectedTags.length} onClick={onConfirm}>
      查找纹样 <ArrowRightIcon size={21} />
    </button>
  </aside>;
}
