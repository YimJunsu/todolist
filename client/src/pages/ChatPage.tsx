/**
 * ChatPage.tsx — AI 챗봇 페이지
 *
 * Google Gemini AI와 실시간 대화할 수 있는 채팅 인터페이스입니다.
 * 대화 히스토리를 로컬 상태로 관리하여 멀티턴(multi-turn) 대화를 지원합니다.
 *
 * ─────────────────────────────────────────────────────────────────
 * 대화 흐름
 * ─────────────────────────────────────────────────────────────────
 *  1. 사용자가 메시지를 입력하고 전송
 *  2. 로컬 히스토리에 사용자 메시지 추가 (즉시 UI 반영)
 *  3. chatApi.sendChatMessage(message, history) 호출
 *  4. 서버에서 Gemini API를 거쳐 AI 응답 반환
 *  5. 로컬 히스토리에 AI 응답 메시지 추가 (UI 반영)
 * ─────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from 'react';
import * as chatApi from '../api/chatApi';
import type { ChatMessage } from '../api/chatApi';
import ChatBubble from '../components/ChatBubble';

function ChatPage() {
  /** 전체 대화 히스토리 (사용자 + AI 메시지 순서대로 쌓임) */
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);

  /** 사용자가 현재 입력 중인 텍스트 */
  const [inputText, setInputText] = useState('');

  /** AI 응답 대기 중 여부 (로딩 스피너 + 입력 비활성화용) */
  const [isWaitingForReply, setIsWaitingForReply] = useState(false);

  /** 오류 메시지 (API 실패 시 표시) */
  const [errorMessage, setErrorMessage] = useState('');

  /** 메시지 목록 하단 자동 스크롤용 ref */
  const messageListBottomRef = useRef<HTMLDivElement>(null);

  /** 새 메시지가 추가될 때마다 자동으로 스크롤을 최하단으로 이동 */
  useEffect(() => {
    messageListBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isWaitingForReply]);

  /**
   * 메시지를 전송하고 AI 응답을 받아 히스토리에 추가합니다.
   */
  const handleSendMessage = async () => {
    const trimmedInput = inputText.trim();
    if (!trimmedInput || isWaitingForReply) return;

    // 사용자 메시지를 히스토리에 즉시 추가
    const userMessage: ChatMessage = { role: 'user', text: trimmedInput };
    const updatedHistory = [...chatHistory, userMessage];
    setChatHistory(updatedHistory);
    setInputText('');
    setErrorMessage('');
    setIsWaitingForReply(true);

    try {
      // 이전 대화 히스토리(서버 전송 시에는 마지막 사용자 메시지 제외)를 포함해 요청
      const response = await chatApi.sendChatMessage(trimmedInput, chatHistory);
      const aiReplyText = response.data.reply;

      // AI 응답을 히스토리에 추가
      const aiMessage: ChatMessage = { role: 'model', text: aiReplyText };
      setChatHistory((prev) => [...prev, aiMessage]);
    } catch (error: any) {
      // 429: 무료 API 한도 초과 / 그 외: 서버 오류
      const serverErrorMessage =
        error.response?.data?.error ?? '응답을 받는 중 오류가 발생했습니다.';
      setErrorMessage(serverErrorMessage);
    } finally {
      setIsWaitingForReply(false);
    }
  };

  /**
   * 대화 히스토리를 초기화하고 새 대화를 시작합니다.
   */
  const handleResetChat = () => {
    setChatHistory([]);
    setErrorMessage('');
    setInputText('');
  };

  /**
   * Enter 키 입력 시 메시지 전송 (Shift+Enter는 줄바꿈)
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 100px)',
        maxWidth: '800px',
        margin: '0 auto',
      }}
    >
      {/* 헤더 영역 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '22px' }}>AI 챗봇</h1>
          <p style={{ margin: '4px 0 0', color: '#888', fontSize: '13px' }}>
            Google Gemini 2.5 Flash · 무료 티어 (500 RPD)
          </p>
        </div>
        <button
          onClick={handleResetChat}
          style={{
            padding: '6px 14px',
            background: '#eee',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          대화 초기화
        </button>
      </div>

      {/* 메시지 목록 영역 */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          border: '1px solid #e0e0e0',
          borderRadius: '12px',
          padding: '16px',
          background: '#fafafa',
          marginBottom: '12px',
        }}
      >
        {/* 대화 시작 안내 메시지 */}
        {chatHistory.length === 0 && !isWaitingForReply && (
          <div
            style={{
              textAlign: 'center',
              color: '#aaa',
              marginTop: '60px',
              fontSize: '14px',
            }}
          >
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>💬</div>
            <p>안녕하세요! 무엇이든 물어보세요.</p>
            <p style={{ fontSize: '12px' }}>Shift+Enter로 줄바꿈, Enter로 전송</p>
          </div>
        )}

        {/* 대화 말풍선 목록 */}
        {chatHistory.map((message, index) => (
          <ChatBubble key={index} message={message} />
        ))}

        {/* AI 응답 대기 중 로딩 표시 */}
        {isWaitingForReply && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#888' }}>
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
              }}
            >
              AI
            </div>
            <div
              style={{
                padding: '10px 14px',
                background: '#f1f3f4',
                borderRadius: '18px 18px 18px 4px',
                fontSize: '20px',
                letterSpacing: '4px',
              }}
            >
              ···
            </div>
          </div>
        )}

        {/* 오류 메시지 표시 */}
        {errorMessage && (
          <div
            style={{
              padding: '10px 14px',
              background: '#fff3cd',
              border: '1px solid #ffc107',
              borderRadius: '8px',
              color: '#856404',
              fontSize: '13px',
              marginTop: '8px',
            }}
          >
            ⚠️ {errorMessage}
          </div>
        )}

        {/* 자동 스크롤 앵커 */}
        <div ref={messageListBottomRef} />
      </div>

      {/* 메시지 입력 영역 */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="메시지를 입력하세요... (Enter: 전송 / Shift+Enter: 줄바꿈)"
          disabled={isWaitingForReply}
          rows={2}
          style={{
            flex: 1,
            padding: '10px 14px',
            border: '1px solid #e0e0e0',
            borderRadius: '10px',
            fontSize: '14px',
            resize: 'none',
            outline: 'none',
            fontFamily: 'inherit',
            lineHeight: '1.5',
          }}
        />
        <button
          onClick={handleSendMessage}
          disabled={isWaitingForReply || !inputText.trim()}
          style={{
            padding: '0 20px',
            background: isWaitingForReply || !inputText.trim() ? '#ccc' : '#4285f4',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            cursor: isWaitingForReply || !inputText.trim() ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            fontSize: '14px',
            transition: 'background 0.2s',
          }}
        >
          전송
        </button>
      </div>
    </div>
  );
}

export default ChatPage;
