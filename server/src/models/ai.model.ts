/**
 * ai.model.ts — AI 챗봇 관련 타입 정의
 *
 * 클라이언트와 서버 간 주고받는 메시지 구조 및
 * Gemini API 요청/응답에 사용되는 타입을 정의합니다.
 */

/**
 * 대화 메시지 한 건의 구조
 * - role: 'user' = 사용자 발화 / 'model' = AI 응답
 * - text: 메시지 내용
 */
export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

/**
 * 클라이언트 → 서버로 전송하는 채팅 요청 바디
 * - message: 현재 사용자 입력 메시지
 * - history: 이전 대화 히스토리 (멀티턴 대화 유지용)
 */
export interface ChatRequest {
  message: string;
  history: ChatMessage[];
}

/**
 * 서버 → 클라이언트로 반환하는 채팅 응답 바디
 * - success: 요청 성공 여부
 * - reply: AI가 생성한 응답 텍스트
 * - model: 응답에 사용된 Gemini 모델명
 * - tokensUsed: 소비된 토큰 수 (무료 한도 모니터링용, 없을 수 있음)
 */
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
