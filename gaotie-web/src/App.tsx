import { useCallback, useState } from 'react';
import { ChatProvider, useChat } from './context/ChatContext';
import { ImageSearchProvider } from './context/ImageSearchContext';
import { SharedTagsProvider, useSharedTags, type ConfirmedTag } from './context/SharedTagsContext';
import type { ChatMessage, Tag } from './context/ChatContext';
import LeftWorkspace from './components/LeftWorkspace';
import RightPanel from './components/RightPanel';
import TopNav from './components/TopNav';
import ImageSearchPage from './components/ImageSearchPage';
import LayoutElementsPage from './components/LayoutElementsPage';
import SuperCanvasPage from './components/superCanvas/SuperCanvasPage';

type TabType = 'demand' | 'image' | 'layout' | 'canvas';

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
  const response = await fetch('http://localhost:3000/chat', {
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

function DemandAnalysisPage() {
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
    const tagsList = selectedTags.map((t) => `${t.topic ? t.topic + '-' : ''}${t.label}`).join('\n');
    alert(`设计目标已确认！\n\n已选标签：\n${tagsList}\n\n即将进入意象图片检索模块...`);
  }, [selectedTags, setConfirmedTags]);

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <LeftWorkspace onSendMessage={handleSendMessage} />
      <RightPanel onConfirm={handleConfirm} />
    </div>
  );
}

function ImageSearchWrapper() {
  const { clearConfirmedTags } = useSharedTags();

  const handleConfirm = useCallback(() => {
    clearConfirmedTags();
    alert('设计目标已确认！\n\n即将进入设计生成流程...');
  }, [clearConfirmedTags]);

  return <ImageSearchPage onConfirm={handleConfirm} />;
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabType>('demand');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopNav activeTab={activeTab} onTabChange={setActiveTab} />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === 'demand' && <DemandAnalysisPage />}
        {activeTab === 'image' && <ImageSearchWrapper />}
        {activeTab === 'layout' && <LayoutElementsPage />}
        {activeTab === 'canvas' && <SuperCanvasPage />}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ChatProvider>
      <SharedTagsProvider>
        <ImageSearchProvider>
          <AppContent />
        </ImageSearchProvider>
      </SharedTagsProvider>
    </ChatProvider>
  );
}
