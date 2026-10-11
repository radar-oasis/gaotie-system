import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

/* eslint-disable react-refresh/only-export-components */

export interface CaseReference {
  id: string;
  title: string;
  image: string;
  description?: string;
  userDescription?: string;
}

export interface CaseChatMessage {
  id: string;
  role: 'user' | 'ai';
  type: 'text' | 'case-card';
  content: string;
  cases?: CaseReference[];
}

interface CaseSearchContextType {
  chatHistory: CaseChatMessage[];
  selectedCases: CaseReference[];
  isLoading: boolean;
  setChatHistory: (messages: CaseChatMessage[]) => void;
  setSelectedCases: (cases: CaseReference[]) => void;
  addMessage: (message: CaseChatMessage) => void;
  addCase: (caseRef: CaseReference) => void;
  removeCase: (caseId: string) => void;
  updateCaseDescription: (caseId: string, description: string) => void;
  setIsLoading: (value: boolean) => void;
  clearChat: () => void;
  clearCases: () => void;
}

const CaseSearchContext = createContext<CaseSearchContextType | undefined>(undefined);

function CaseSearchContextProvider({ children }: { children: ReactNode }) {
  const [chatHistory, setChatHistory] = useState<CaseChatMessage[]>([]);
  const [selectedCases, setSelectedCases] = useState<CaseReference[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const addMessage = useCallback((message: CaseChatMessage) => {
    setChatHistory(prev => [...prev, message]);
  }, []);

  const addCase = useCallback((caseRef: CaseReference) => {
    setSelectedCases(prev => {
      if (prev.some(c => c.id === caseRef.id)) {
        return prev;
      }
      return [...prev, { ...caseRef, userDescription: '' }];
    });
  }, []);

  const removeCase = useCallback((caseId: string) => {
    setSelectedCases(prev => prev.filter(c => c.id !== caseId));
  }, []);

  const updateCaseDescription = useCallback((caseId: string, description: string) => {
    setSelectedCases(prev =>
      prev.map(c => (c.id === caseId ? { ...c, userDescription: description } : c)),
    );
  }, []);

  const clearChat = useCallback(() => {
    setChatHistory([]);
  }, []);

  const clearCases = useCallback(() => {
    setSelectedCases([]);
  }, []);

  return (
    <CaseSearchContext.Provider
      value={{
        chatHistory,
        selectedCases,
        isLoading,
        setChatHistory,
        setSelectedCases,
        addMessage,
        addCase,
        removeCase,
        updateCaseDescription,
        setIsLoading,
        clearChat,
        clearCases,
      }}
    >
      {children}
    </CaseSearchContext.Provider>
  );
}

export { CaseSearchContextProvider };
export function useCaseSearch() {
  const context = useContext(CaseSearchContext);
  if (!context) {
    throw new Error('useCaseSearch must be used within a CaseSearchProvider');
  }
  return context;
}
