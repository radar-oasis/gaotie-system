import { CloseIcon } from 'tdesign-icons-react';
import { useChat, type Tag } from '../context/ChatContext';

export default function SelectedTagItem({ tag }: { tag: Tag }) {
  const { removeTag } = useChat();
  return <div className="theme-selected-item">
    <div>{tag.topic && <span>{tag.topic}</span>}<strong>{tag.label}</strong></div>
    <button type="button" className="pattern-selected__remove" aria-label={`移除 ${tag.label}`}
      onClick={() => removeTag(tag.id)}><CloseIcon /></button>
  </div>;
}
