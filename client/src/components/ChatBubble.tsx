/**
 * ChatBubble.tsx — 개별 채팅 메시지 말풍선 컴포넌트
 *
 * role에 따라 사용자(오른쪽) / AI(왼쪽) 배치를 결정합니다.
 * AI 응답 텍스트의 줄바꿈(\n)을 <br>로 렌더링합니다.
 */

import type { ChatMessage } from '../api/chatApi';

interface ChatBubbleProps {
  message: ChatMessage;
}

function ChatBubble({ message }: ChatBubbleProps) {
  const isUserMessage = message.role === 'user';

  /** 줄바꿈 문자를 <br> 태그로 변환하여 렌더링 */
  const renderTextWithLineBreaks = (text: string) =>
    text.split('\n').map((line, index) => (
      <span key={index}>
        {line}
        <br />
      </span>
    ));

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUserMessage ? 'flex-end' : 'flex-start',
        marginBottom: '12px',
      }}
    >
      {/* AI 아바타 (AI 메시지일 때만 표시) */}
      {!isUserMessage && (
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: '#4285f4',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            fontWeight: 'bold',
            marginRight: '8px',
            flexShrink: 0,
          }}
        >
          AI
        </div>
      )}

      {/* 메시지 말풍선 */}
      <div
        style={{
          maxWidth: '70%',
          padding: '10px 14px',
          borderRadius: isUserMessage ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          background: isUserMessage ? '#4CAF50' : '#f1f3f4',
          color: isUserMessage ? 'white' : '#202124',
          fontSize: '14px',
          lineHeight: '1.6',
          wordBreak: 'break-word',
        }}
      >
        {renderTextWithLineBreaks(message.text)}
      </div>

      {/* 사용자 아바타 (사용자 메시지일 때만 표시) */}
      {isUserMessage && (
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: '#4CAF50',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            fontWeight: 'bold',
            marginLeft: '8px',
            flexShrink: 0,
          }}
        >
          나
        </div>
      )}
    </div>
  );
}

export default ChatBubble;
