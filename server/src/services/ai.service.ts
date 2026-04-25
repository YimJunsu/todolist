/**
 * ai.service.ts — Gemini AI 비즈니스 로직
 *
 * Google Generative AI SDK를 사용해 Gemini API를 호출합니다.
 * 대화 히스토리를 받아 멀티턴(multi-turn) 채팅 세션을 구성하고,
 * AI 응답 텍스트와 토큰 사용량을 반환합니다.
 *
 * ─────────────────────────────────────────────────────────────────
 * 사용 모델: gemini-2.5-flash (무료 티어 지원)
 *   - 무료 한도: 10 RPM / 500 RPD (태평양 표준시 기준 매일 초기화)
 *   - 한도 초과 시 HTTP 429 에러 발생 → controller에서 처리
 * ─────────────────────────────────────────────────────────────────
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ChatMessage, ChatResponse } from '../models/ai.model.js';

/** Gemini API 키 (.env 파일의 GEMINI_API_KEY 값) */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';

/** Google Generative AI 클라이언트 인스턴스 */
const geminiClient = new GoogleGenerativeAI(GEMINI_API_KEY);

/** 사용할 Gemini 모델명 (무료 티어 지원 모델) */
const GEMINI_MODEL_NAME = 'gemini-2.5-flash';

/** Gemini 모델 인스턴스 */
const geminiModel = geminiClient.getGenerativeModel({ model: GEMINI_MODEL_NAME });

export const aiService = {
  /**
   * Gemini API에 메시지를 전송하고 AI 응답을 반환합니다.
   *
   * 이전 대화 히스토리를 포함한 채팅 세션을 시작하여
   * 멀티턴(multi-turn) 대화가 가능하도록 합니다.
   *
   * @param userMessage - 사용자가 입력한 현재 메시지
   * @param chatHistory - 이전 대화 기록 (role + text 배열)
   * @returns AI 응답 텍스트, 사용 모델명, 토큰 사용량
   * @throws 429 에러 시 컨트롤러에서 별도 처리
   */
  sendMessage: async (
    userMessage: string,
    chatHistory: ChatMessage[]
  ): Promise<ChatResponse> => {
    // Gemini SDK가 요구하는 히스토리 형식으로 변환
    // { role, text } → { role, parts: [{ text }] }
    const formattedHistory = chatHistory.map((msg) => ({
      role: msg.role,
      parts: [{ text: msg.text }],
    }));

    // 히스토리를 포함한 채팅 세션 시작
    const chatSession = geminiModel.startChat({ history: formattedHistory });

    // 사용자 메시지를 세션에 전송하고 응답 수신
    const result = await chatSession.sendMessage(userMessage);
    const replyText = result.response.text();

    // 토큰 사용량 추출 (무료 한도 모니터링에 활용 가능)
    const usageMeta = result.response.usageMetadata;
    const tokensUsed = usageMeta
      ? {
          input: usageMeta.promptTokenCount ?? 0,
          output: usageMeta.candidatesTokenCount ?? 0,
          total: usageMeta.totalTokenCount ?? 0,
        }
      : undefined;

    console.log(
      `[AI Service] 응답 완료 — 모델: ${GEMINI_MODEL_NAME}`,
      tokensUsed ? `/ 총 토큰: ${tokensUsed.total}` : ''
    );

    return {
      success: true,
      reply: replyText,
      model: GEMINI_MODEL_NAME,
      tokensUsed,
    };
  },
};
