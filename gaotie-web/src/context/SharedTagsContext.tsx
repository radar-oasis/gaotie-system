import { createContext, useContext, useState, type ReactNode } from 'react';

/* eslint-disable react-refresh/only-export-components */

export interface ConfirmedTag {
  label: string;
  topic?: string;
}

interface SharedTagsContextType {
  confirmedTags: ConfirmedTag[];
  setConfirmedTags: (tags: ConfirmedTag[]) => void;
  clearConfirmedTags: () => void;
}

const SharedTagsContext = createContext<SharedTagsContextType | undefined>(undefined);

export function SharedTagsProvider({ children }: { children: ReactNode }) {
  const [confirmedTags, setConfirmedTagsState] = useState<ConfirmedTag[]>([]);

  const setConfirmedTags = (tags: ConfirmedTag[]) => {
    setConfirmedTagsState(tags);
  };

  const clearConfirmedTags = () => {
    setConfirmedTagsState([]);
  };

  return (
    <SharedTagsContext.Provider value={{ confirmedTags, setConfirmedTags, clearConfirmedTags }}>
      {children}
    </SharedTagsContext.Provider>
  );
}

export function useSharedTags() {
  const context = useContext(SharedTagsContext);
  if (!context) {
    throw new Error('useSharedTags must be used within SharedTagsProvider');
  }
  return context;
}
