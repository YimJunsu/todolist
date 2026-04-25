/**
 * chatApi.ts — AI 챗봇 API 레이어
 *
 * 서버의 /api/ai/chat 엔드포인트와 통신합니다.
 * Vite 개발 서버의 프록시 설정을 통해 포트 충돌 없이 호출합니다.
 * (vite.config.ts: '/api' → 'http://127.0.0.1:4000')
 */

import axios from 'axios';

/** 대화 메시지 한 건의 구조 (서버 ai.model.ts와 동일) */
export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

/** 서버에서 반환하는 AI 응답 구조 */
export interface ChatResponse {
  success: boolean;
  reply: string;
  model: string;
  tokensUsed?: {
    input: number;
    output: number;
    total: number;
  };
}

/** 채팅 API axios 인스턴스 */
const chatApiClient = axios.create({
  baseURL: '/api/ai',
});

/**
 * Gemini AI에 메시지를 전송하고 응답을 받습니다.
 *
 * @param message - 사용자가 입력한 현재 메시지
 * @param history - 이전 대화 히스토리 (멀티턴 대화 유지용)
 * @returns 서버에서 반환된 ChatResponse
 */
export const sendChatMessage = (
  message: string,
  history: ChatMessage[]
) =>
  chatApiClient.post<ChatResponse>('/chat', { message, history });
