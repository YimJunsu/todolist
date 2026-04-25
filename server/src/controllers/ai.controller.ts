/**
 * ai.controller.ts — AI 챗봇 HTTP 요청 처리
 *
 * 클라이언트로부터 채팅 요청을 받아 유효성을 검사하고,
 * aiService에 처리를 위임한 뒤 결과를 응답합니다.
 *
 * 에러 처리:
 *   - 400: 메시지 누락
 *   - 429: Gemini API 무료 한도 초과
 *   - 500: 서버 내부 오류
 */

import type { Request, Response } from 'express';
import { aiService } from '../services/ai.service.js';
import type { ChatRequest } from '../models/ai.model.js';

export const aiController = {
  /**
   * POST /api/ai/chat
   *
   * 사용자의 메시지와 대화 히스토리를 받아 Gemini AI 응답을 반환합니다.
   *
   * Request Body: { message: string, history: ChatMessage[] }
   * Response:     ChatResponse | { success: false, error: string }
   */
  chat: async (req: Request, res: Response) => {
    const { message, history = [] }: ChatRequest = req.body;

    // 메시지 입력값 검증
    if (!message || message.trim() === '') {
      return res.status(400).json({
        success: false,
        error: '메시지를 입력해주세요.',
      });
    }

    // API 키 설정 여부 검증
    if (!process.env.GEMINI_API_KEY) {
      console.error('[AI Controller] GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');
      return res.status(500).json({
        success: false,
        error: 'AI 서비스가 설정되지 않았습니다. 서버 관리자에게 문의하세요.',
      });
    }

    try {
      console.log(`[AI Controller] 채팅 요청 수신 — 히스토리: ${history.length}건`);

      const chatResponse = await aiService.sendMessage(message, history);
      res.json(chatResponse);
    } catch (error: any) {
      console.error('[AI Controller] 오류 발생:', error.message);

      // Gemini API 무료 티어 한도 초과 (429 Too Many Requests)
      if (error.status === 429) {
        return res.status(429).json({
          success: false,
          error: 'API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.',
        });
      }

      res.status(500).json({
        success: false,
        error: '서버 오류가 발생했습니다.',
      });
    }
  },
};
