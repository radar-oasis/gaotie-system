import { createContext, useContext, useRef, useState, type ReactNode, type RefObject } from 'react';

/* eslint-disable react-refresh/only-export-components */

export interface Pattern {
  id: string;
  name: string;
  imageUrl: string;
  dynasty: string;
  description: string;
  carriers?: string[];
  materials?: string[];
  motifs?: string[];
  layouts?: string[];
  categories?: string[];
  matches?: PatternMatch[];
}

export type MatchKind = 'direct' | 'related';
export interface PatternMatch { groupId: string; kind: MatchKind; reasons: string[] }
export interface SearchGroupInput { id: string; label: string; keywords: string[] }
export interface PatternSearchGroup extends SearchGroupInput {
  directTotal: number;
  relatedTotal: number;
  directIds: string[];
  relatedIds: string[];
}

export interface IntentFilter {
  userInput?: string;
  motifs: string[];
  dynasties: string[];
  materials: string[];
  others: string[];
  carriers?: string[];
  layouts?: string[];
  groups?: SearchGroupInput[];
}

interface ImageSearchContextType {
  searchRequestRef: RefObject<AbortController | null>;
  patterns: Pattern[];
  searchGroups: PatternSearchGroup[];
  setSearchGroups: (groups: PatternSearchGroup[]) => void;
  selectedPatterns: Pattern[];
  intentFilters: IntentFilter;
  reasoning: string;
  isSearching: boolean;
  searchMessage: string;
  autoSearchKey: string;
  searchInput: string;
  setSearchInput: (input: string) => void;
  addPattern: (pattern: Pattern) => void;
  removePattern: (id: string) => void;
  setPatterns: (patterns: Pattern[]) => void;
  setSelectedPatterns: (patterns: Pattern[]) => void;
  setIntentFilters: (filters: IntentFilter) => void;
  setReasoning: (reasoning: string) => void;
  setIsSearching: (isSearching: boolean) => void;
  setSearchMessage: (message: string) => void;
  setAutoSearchKey: (key: string) => void;
  clearSelectedPatterns: () => void;
}

const ImageSearchContext = createContext<ImageSearchContextType | undefined>(undefined);

export function ImageSearchProvider({ children }: { children: ReactNode }) {
  const searchRequestRef = useRef<AbortController | null>(null);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [searchGroups, setSearchGroups] = useState<PatternSearchGroup[]>([]);
  const [selectedPatterns, setSelectedPatterns] = useState<Pattern[]>([]);
  const [intentFilters, setIntentFilters] = useState<IntentFilter>({
    motifs: [],
    dynasties: [],
    materials: [],
    others: [],
  });
  const [reasoning, setReasoning] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchMessage, setSearchMessage] = useState<string>('');
  const [autoSearchKey, setAutoSearchKey] = useState<string>('');
  const [searchInput, setSearchInput] = useState('');

  const addPattern = (pattern: Pattern) => {
    setSelectedPatterns((prev) => {
      if (prev.some((p) => p.id === pattern.id)) {
        return prev;
      }
      return [...prev, pattern];
    });
  };

  const removePattern = (id: string) => {
    setSelectedPatterns((prev) => prev.filter((p) => p.id !== id));
  };

  const clearSelectedPatterns = () => {
    setSelectedPatterns([]);
  };

  return (
    <ImageSearchContext.Provider
      value={{
        searchRequestRef,
        patterns,
        searchGroups,
        setSearchGroups,
        selectedPatterns,
        intentFilters,
        reasoning,
        isSearching,
        searchMessage,
        autoSearchKey,
        searchInput,
        setSearchInput,
        addPattern,
        removePattern,
        setPatterns,
        setSelectedPatterns,
        setIntentFilters,
        setReasoning,
        setIsSearching,
        setSearchMessage,
        setAutoSearchKey,
        clearSelectedPatterns,
      }}
    >
      {children}
    </ImageSearchContext.Provider>
  );
}

export function useImageSearch() {
  const context = useContext(ImageSearchContext);
  if (!context) {
    throw new Error('useImageSearch must be used within ImageSearchProvider');
  }
  return context;
}
