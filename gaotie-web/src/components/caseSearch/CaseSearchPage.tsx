import { useCallback, useEffect, useState } from 'react';
import { useCaseSearch, type CaseReference } from '../../context/CaseSearchContext';
import CaseSearchHeader from './CaseSearchHeader';
import CaseChatStream from './CaseChatStream';
import CaseInputArea from './CaseInputArea';
import SelectedCasesSidebar from './SelectedCasesSidebar';
import { apiUrl } from '../../utils/backendUrls';
import './CaseSearch.css';

interface CaseSearchPageProps {
  onConfirm: (selectedCases: CaseReference[]) => void;
  onSkip?: () => void;
}

interface ChatApiResponse {
  status: 'success' | 'error';
  reply: string;
  cases: CaseReference[];
}

function generateId(): string {
  return `case-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

async function queryCases(message: string): Promise<ChatApiResponse> {
  const response = await fetch(apiUrl('/case-search/chat'), {
    method: 'POST',
    signal: AbortSignal.timeout(12000),
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

export default function CaseSearchPage({ onConfirm, onSkip }: CaseSearchPageProps) {
  const [dependencyMessage, setDependencyMessage] = useState('正在检查案例库…');
  const [checking, setChecking] = useState(false);
  const checkHealth = useCallback(async (signal?: AbortSignal) => {
    setChecking(true);
    try {
      const response = await fetch(apiUrl('/case-search/health'), { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('health failed');
      const result = await response.json();
      if (!signal?.aborted) setDependencyMessage(result.message || '案例库状态暂不可用，请重试检查。');
    } catch { if (!signal?.aborted) setDependencyMessage('案例服务暂不可用，请检查后端及案例数据库；可跳过案例继续设计。'); }
    finally { if (!signal?.aborted) setChecking(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void checkHealth(controller.signal); return () => controller.abort(); }, [checkHealth]);
  const { addMessage, setIsLoading, selectedCases } = useCaseSearch();

  const handleSendMessage = useCallback(
    async (content: string) => {
      const userMessage = {
        id: generateId(),
        role: 'user' as const,
        type: 'text' as const,
        content,
      };

      addMessage(userMessage);
      setIsLoading(true);

      try {
        const result = await queryCases(content);

        const aiMessage = {
          id: generateId(),
          role: 'ai' as const,
          type: result.cases.length > 0 ? 'case-card' as const : 'text' as const,
          content: result.reply,
          cases: result.cases,
        };

        addMessage(aiMessage);
      } catch (error) {
        console.error('Error querying cases:', error);

        const errorMessage = {
          id: generateId(),
          role: 'ai' as const,
          type: 'text' as const,
          content: '抱歉，涂装案例服务暂时不可用，请确保后端服务已启动。',
        };

        addMessage(errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [addMessage, setIsLoading],
  );

  const handleConfirm = useCallback(() => {
    if (selectedCases.length > 0) {
      onConfirm(selectedCases);
    }
  }, [selectedCases, onConfirm]);

  return (
    <div className="case-workspace">
      <CaseSearchHeader />
      <div className="case-dependency-status" role="status">
        <span>{dependencyMessage}</span>
        <button type="button" disabled={checking} onClick={() => void checkHealth()}>重新检查</button>
        {onSkip && <button type="button" onClick={onSkip}>跳过案例，继续效果生成</button>}
      </div>
      <div className="case-workspace-body">
      <div className="case-conversation">
        <CaseChatStream />
        <CaseInputArea onSendMessage={handleSendMessage} />
      </div>

        <SelectedCasesSidebar onConfirm={handleConfirm} />
      </div>
    </div>
  );
}
