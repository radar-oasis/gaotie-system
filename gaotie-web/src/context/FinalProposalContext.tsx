import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type {
  AdjustmentHistoryItem,
  GeneratedProposal,
} from '../components/finalProposal/finalProposalTypes';

/* eslint-disable react-refresh/only-export-components */

interface FinalProposalContextType {
  // null denotes a legacy selection that only has URLs; [] is an explicit empty choice.
  selectedReferenceAssetIds: string[] | null;
  setSelectedReferenceAssetIds: Dispatch<SetStateAction<string[] | null>>;
  referenceRemovalNotice: string;
  setReferenceRemovalNotice: Dispatch<SetStateAction<string>>;
  selectedReferenceImageUrls: string[];
  setSelectedReferenceImageUrls: Dispatch<SetStateAction<string[]>>;
  currentProposal: GeneratedProposal | null;
  setCurrentProposal: (proposal: GeneratedProposal | null) => void;
  archivedProposals: GeneratedProposal[];
  setArchivedProposals: Dispatch<SetStateAction<GeneratedProposal[]>>;
  isGenerating: boolean;
  setIsGenerating: (value: boolean) => void;
  adjustmentHistory: AdjustmentHistoryItem[];
  setAdjustmentHistory: (items: AdjustmentHistoryItem[]) => void;
  addAdjustmentHistory: (item: AdjustmentHistoryItem) => void;
  selectedCompareIds: string[];
  setSelectedCompareIds: (ids: string[]) => void;
  toggleCompareId: (id: string) => void;
}

const FinalProposalContext = createContext<FinalProposalContextType | undefined>(
  undefined,
);

export function FinalProposalProvider({ children }: { children: ReactNode }) {
  const [selectedReferenceAssetIds, setSelectedReferenceAssetIds] = useState<string[] | null>(null);
  const [referenceRemovalNotice, setReferenceRemovalNotice] = useState('');
  const [selectedReferenceImageUrls, setSelectedReferenceImageUrls] = useState<string[]>([]);
  const [currentProposal, setCurrentProposal] =
    useState<GeneratedProposal | null>(null);
  const [archivedProposals, setArchivedProposals] = useState<GeneratedProposal[]>(
    [],
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [adjustmentHistory, setAdjustmentHistory] = useState<
    AdjustmentHistoryItem[]
  >([]);
  const [selectedCompareIds, setSelectedCompareIds] = useState<string[]>([]);

  const addAdjustmentHistory = useCallback((item: AdjustmentHistoryItem) => {
    setAdjustmentHistory((prev) => [item, ...prev].slice(0, 8));
  }, []);

  const toggleCompareId = useCallback((id: string) => {
    setSelectedCompareIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }

      return [...prev, id].slice(-3);
    });
  }, []);

  return (
    <FinalProposalContext.Provider
      value={{
        selectedReferenceAssetIds,
        setSelectedReferenceAssetIds,
        referenceRemovalNotice,
        setReferenceRemovalNotice,
        selectedReferenceImageUrls,
        setSelectedReferenceImageUrls,
        currentProposal,
        setCurrentProposal,
        archivedProposals,
        setArchivedProposals,
        isGenerating,
        setIsGenerating,
        adjustmentHistory,
        setAdjustmentHistory,
        addAdjustmentHistory,
        selectedCompareIds,
        setSelectedCompareIds,
        toggleCompareId,
      }}
    >
      {children}
    </FinalProposalContext.Provider>
  );
}

export function useFinalProposal() {
  const context = useContext(FinalProposalContext);

  if (!context) {
    throw new Error('useFinalProposal must be used within FinalProposalProvider');
  }

  return context;
}
