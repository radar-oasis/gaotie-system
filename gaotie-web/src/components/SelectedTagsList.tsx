import { useChat } from '../context/ChatContext';
import SelectedTagItem from './SelectedTagItem';

export default function SelectedTagsList() {
  const { selectedTags } = useChat();
  return <div className="pattern-selected__list">
    {selectedTags.length ? selectedTags.map(tag => <SelectedTagItem key={tag.id} tag={tag} />)
      : <p className="pattern-selected__empty">还未选择意象</p>}
  </div>;
}
