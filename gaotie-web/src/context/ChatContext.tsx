import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

/* eslint-disable react-refresh/only-export-components */

export interface Tag {
  id: string;
  label: string;
  topic?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  type: 'text' | 'rich-card';
  content: string;
  tags?: Tag[];
}

interface ChatContextType {
  chatHistory: ChatMessage[];
  selectedTags: Tag[];
  isInputting: boolean;
  setChatHistory: (messages: ChatMessage[]) => void;
  setSelectedTags: (tags: Tag[]) => void;
  addMessage: (message: ChatMessage) => void;
  addTag: (tag: Tag) => void;
  removeTag: (tagId: string) => void;
  setIsInputting: (value: boolean) => void;
  clearChat: () => void;
  clearTags: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [isInputting, setIsInputting] = useState(false);

  const addMessage = useCallback((message: ChatMessage) => {
    setChatHistory(prev => [...prev, message]);
  }, []);

  const addTag = useCallback((tag: Tag) => {
    setSelectedTags(prev => {
      if (prev.some(t => t.label === tag.label)) {
        return prev;
      }
      return [...prev, tag];
    });
  }, []);

  const removeTag = useCallback((tagId: string) => {
    setSelectedTags(prev => prev.filter(t => t.id !== tagId));
  }, []);

  const setInputting = useCallback((value: boolean) => {
    setIsInputting(value);
  }, []);

  const clearChat = useCallback(() => {
    setChatHistory([]);
  }, []);

  const clearTags = useCallback(() => {
    setSelectedTags([]);
  }, []);

  return (
    <ChatContext.Provider
      value={{
        chatHistory,
        selectedTags,
        isInputting,
        setChatHistory,
        setSelectedTags,
        addMessage,
        addTag,
        removeTag,
        setIsInputting: setInputting,
        clearChat,
        clearTags,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}
