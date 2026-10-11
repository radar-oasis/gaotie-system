import { AddIcon, CheckIcon } from 'tdesign-icons-react';
import { useChat, type ChatMessage, type Tag } from '../context/ChatContext';

function boldText(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : part);
}

export default function ChatMessageItem({ message }: { message: ChatMessage }) {
  const { selectedTags, addTag, removeTag } = useChat();
  if (message.role === 'user') {
    return <article className="theme-message theme-message--user" aria-label="我的消息"><p>{message.content}</p></article>;
  }
  const tags: Tag[] = [...(message.tags ?? [])];
  let ordinal = 0;
  const content = message.content.replace(/\[TAG:\s*([^\]]+)\]/g, (_raw, value: string) => {
    const raw = value.trim();
    const split = raw.indexOf('-');
    const label = (split > 0 ? raw.slice(split + 1) : raw).trim();
    if (label) tags.push({ id: `${message.id}-tag-${ordinal++}`, label, topic: split > 0 ? raw.slice(0, split).trim() : undefined });
    return '';
  }).trim();
  const unique = [...new Map(tags.map(tag => [tag.label, { ...tag, id: `${message.id}:${tag.id}:${tag.label}` }])).values()];
  const topics = [...new Set(unique.map(tag => tag.topic || '相关意象'))];
  return <article className="theme-message theme-message--ai" aria-label="AI 回复">
    <div className="theme-message__author"><span>AI</span>主题解读</div>
    <div className="theme-message__reply">
      <div className="theme-message__text">{content.split(/\n+/).filter(line => line.trim()).map((line, index) =>
        /^#{1,6}\s/.test(line) ? <h3 key={index}>{boldText(line.replace(/^#{1,6}\s+/, ''))}</h3>
          : <p key={index}>{boldText(line)}</p>)}</div>
      {!!topics.length && <div className="theme-tag-groups">{topics.map(topic => <section key={topic} aria-label={topic}>
        <h3>{topic}</h3>
        <div className="theme-tags">{unique.filter(tag => (tag.topic || '相关意象') === topic).map(tag => {
          const selected = selectedTags.find(item => item.label === tag.label);
          return <button type="button" key={tag.id} className="theme-tag" aria-pressed={!!selected}
            aria-label={`${selected ? '取消选择' : '选择'} ${tag.label}`}
            onClick={() => selected ? removeTag(selected.id) : addTag(tag)}>
            {tag.label}{selected ? <CheckIcon size={16} /> : <AddIcon size={16} />}
          </button>;
        })}</div>
      </section>)}</div>}
    </div>
  </article>;
}
