/**
 * ai.routes.ts — AI 챗봇 라우트 정의
 *
 * /api/ai 경로 하위의 엔드포인트를 등록합니다.
 */

import { Router } from 'express';
import { aiController } from '../controllers/ai.controller.js';

const router = Router();

// POST /api/ai/chat — 사용자 메시지 전송 및 AI 응답 수신
router.post('/chat', aiController.chat);

export default router;
