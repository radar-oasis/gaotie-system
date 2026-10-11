import { useReusePattern } from './components/assets/useReusePattern';
import AssetsPage from './components/assets/AssetsPage';
import { useCallback, useState } from 'react';
import './App.css';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ChatProvider, useChat } from './context/ChatContext';
import { ImageSearchProvider } from './context/ImageSearchContext';
import { CaseSearchContextProvider, type CaseReference } from './context/CaseSearchContext';
import { SharedTagsProvider, useSharedTags, type ConfirmedTag } from './context/SharedTagsContext';
import type { ChatMessage, Tag } from './context/ChatContext';
import LeftWorkspace from './components/LeftWorkspace';
import RightPanel from './components/RightPanel';
import TopNav from './components/TopNav';
import ImageSearchPage from './components/ImageSearchPage';
import LayoutElementsPage from './components/LayoutElementsPage';
import SuperCanvasPage from './components/superCanvas/SuperCanvasPage';
import { CaseSearchPage } from './components/caseSearch';
import { ColorConfigPage } from './components/colorConfig';
import { ColorConfigProvider } from './context/ColorConfigContext';
import { SuperCanvasProvider } from './context/SuperCanvasContext';
import { FinalProposalProvider } from './context/FinalProposalContext';
import FinalProposalPage from './components/finalProposal/FinalProposalPage';
import { apiUrl } from './utils/backendUrls';
import LoginPage from './components/auth/LoginPage';
import { ProjectProvider, useProject } from './projects/ProjectContext';
import ProjectPersistence from './components/projects/ProjectPersistence';
import type { WorkspaceTab } from './projects/workspaceSnapshot';

import './components/WorkspaceDialogue.css';

type TabType = WorkspaceTab;

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

interface DeepSeekResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

async function sendToDeepSeek(messages: ChatMessage[], tags: Tag[]): Promise<DeepSeekResponse> {
  const response = await fetch(apiUrl('/chat'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages, selectedTags: tags }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

function DemandAnalysisPage({ onFindPatterns }: { onFindPatterns: () => void }) {
  const { chatHistory, selectedTags, addMessage, setIsInputting } = useChat();
  const { setConfirmedTags } = useSharedTags();

  const handleSendMessage = useCallback(async (content: string) => {
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      type: 'text',
      content,
    };

    addMessage(userMessage);
    setIsInputting(true);

    try {
      const currentHistory = [...chatHistory, userMessage];
      const result = await sendToDeepSeek(currentHistory, selectedTags);
      const aiContent = result.choices?.[0]?.message?.content || '抱歉，我暂时无法回应这个问题。';

      const aiMessage: ChatMessage = {
        id: generateId(),
        role: 'ai',
        type: 'text',
        content: aiContent,
      };

      addMessage(aiMessage);
    } catch (error) {
      console.error('Error calling DeepSeek:', error);
      const errorMessage: ChatMessage = {
        id: generateId(),
        role: 'ai',
        type: 'text',
        content: '抱歉，连接 AI 服务时出现了问题，请确保后端服务已启动。',
      };
      addMessage(errorMessage);
    } finally {
      setIsInputting(false);
    }
  }, [chatHistory, selectedTags, addMessage, setIsInputting]);

  const handleConfirm = useCallback(() => {
    const tagsToConfirm: ConfirmedTag[] = selectedTags.map((t) => ({
      label: t.label,
      topic: t.topic,
    }));
    setConfirmedTags(tagsToConfirm);
    onFindPatterns();
  }, [selectedTags, setConfirmedTags, onFindPatterns]);

  return (
    <div className="pattern-search-page cultural-theme-page">
      <LeftWorkspace onSendMessage={handleSendMessage} />
      <RightPanel onConfirm={handleConfirm} />
    </div>
  );
}

function CaseSearchWrapper({ onSkip }: { onSkip: () => void }) {
  const handleConfirm = useCallback((cases: CaseReference[]) => {
    console.log('Selected cases:', cases);
    alert(`已确认 ${cases.length} 个涂装案例！\n\n案例列表：\n${cases.map(c => `• ${c.title}`).join('\n')}`);
  }, []);

  return <CaseSearchPage onConfirm={handleConfirm} onSkip={onSkip} />;
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabType>('demand');
  const { currentProject } = useProject();
  const reusePattern = useReusePattern(() => setActiveTab('canvas'), currentProject?.id);

  return (
    <div className="pattern-workspace" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <ProjectPersistence activeTab={activeTab} onRestoreTab={setActiveTab}>
        <div className="pattern-workspace__body">
        <TopNav activeTab={activeTab} onTabChange={setActiveTab} />
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {activeTab === 'demand' && <DemandAnalysisPage key={currentProject?.id ?? 'local'} onFindPatterns={() => setActiveTab('image')} />}
          {activeTab === 'image' && <ImageSearchPage key={currentProject?.id ?? 'local'} onConfirm={() => setActiveTab('canvas')} />}
          {activeTab === 'layout' && <LayoutElementsPage />}
          {activeTab === 'color' && <ColorConfigPage />}
          {activeTab === 'canvas' && <SuperCanvasPage projectKey={currentProject?.id ?? 'local'} />}
          {activeTab === 'case' && <CaseSearchWrapper onSkip={() => setActiveTab('proposal')} />}
          {activeTab === 'assets' && <AssetsPage onReusePattern={reusePattern} />}
          {activeTab === 'proposal' && <FinalProposalPage onNavigate={setActiveTab} />}
        </div>
        </div>
      </ProjectPersistence>
    </div>
  );
}

function AuthenticatedApp() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="app-loading">正在进入工作台...</div>;
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <ProjectProvider>
      <ChatProvider>
        <SharedTagsProvider>
          <ImageSearchProvider>
            <CaseSearchContextProvider>
              <ColorConfigProvider>
                <SuperCanvasProvider>
                  <FinalProposalProvider>
                    <AppContent />
                  </FinalProposalProvider>
                </SuperCanvasProvider>
              </ColorConfigProvider>
            </CaseSearchContextProvider>
          </ImageSearchProvider>
        </SharedTagsProvider>
      </ChatProvider>
    </ProjectProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}
