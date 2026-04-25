/**
 * EditorPage.tsx — OT(Operational Transformation) 방식 실시간 공유 에디터
 *
 * ─────────────────────────────────────────────────────────────────
 * 기존(버전 번호) vs OT 방식 비교
 * ─────────────────────────────────────────────────────────────────
 * [기존] 동시 입력 → "충돌" → 한 명의 내용이 사라짐
 * [OT]  동시 입력 → transform → 두 입력 모두 올바르게 반영됨
 *
 * ─────────────────────────────────────────────────────────────────
 * 전체 동작 순서 (흐름별)
 * ─────────────────────────────────────────────────────────────────
 *
 * ── [A] 접속 초기화 흐름 ──
 *   A1. 컴포넌트 마운트 → connect() 호출
 *   A2. WebSocket 연결 생성 (ws://host/ws)
 *   A3. 서버로부터 { type: 'init', content, revision } 수신
 *   A4. content·serverRevision 초기화 → textarea 표시
 *
 * ── [B] 로컬 편집 흐름 (내가 타이핑할 때) ──
 *   B1. 사용자 입력 → handleChange 호출
 *   B2. diffToOps(old, new) → TextOp[] 계산 (어디서 무엇이 바뀌었는지)
 *   B3. 로컬 문서·UI 즉시 업데이트 (사용자 반응성 확보)
 *   B4. 생성된 op를 bufferOps에 추가
 *   B5. flushBuffer() 호출
 *         → inflightOps가 비어있으면: bufferOps를 inflightOps로 이동 후 서버 전송
 *         → inflightOps가 있으면: 대기 (ack 수신 후 자동 전송)
 *
 * ── [C] ack 수신 흐름 (내 작업이 서버에 적용됐을 때) ──
 *   C1. 서버로부터 { type: 'ack', opId, revision } 수신
 *   C2. inflightOps에서 해당 opId 제거 / serverRevision 갱신
 *   C3. inflightOps가 비었으면 flushBuffer() → bufferOps 전송
 *
 * ── [D] remote op 수신 흐름 (다른 사용자가 편집했을 때) ──
 *   D1. 서버로부터 { type: 'op', op, revision } 수신
 *   D2. remoteOp를 나의 inflightOps에 대해 transform → remoteOp'
 *         (내가 이미 서버에 보낸 작업 위에 상대 작업을 올바르게 적용)
 *   D3. inflightOps를 원본 remoteOp에 대해 transform → inflightOps'
 *         (서버에서 상대 작업 먼저 적용된 상태를 반영)
 *   D4. bufferOps를 변환된 remoteOp'에 대해 transform → bufferOps'
 *         (아직 전송 안 한 내 작업 위치도 보정)
 *   D5. 변환된 remoteOp'를 로컬 문서에 적용 → UI 업데이트
 *
 * ─────────────────────────────────────────────────────────────────
 * 상태 변수
 * ─────────────────────────────────────────────────────────────────
 *   serverRevision  : 마지막으로 서버가 확인한(ack) revision 번호
 *   inflightOpsRef  : 서버에 보냈으나 아직 ack를 받지 못한 작업 큐
 *   bufferOpsRef    : 로컬에서 생성됐지만 아직 서버에 보내지 않은 작업 큐
 * ─────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { applyOp, transformOp, diffToOps } from '../ot';
import type { TextOp } from '../ot';

// 서버로 보내는 작업 타입 (TextOp + 메타정보)
type ClientOp = TextOp & {
  revision: number; // 작업 기반 서버 revision
  opId: string;     // ack 매칭용 고유 ID
};

/** 고유 ID 생성기 (타임스탬프 + 랜덤) */
function genOpId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function EditorPage() {
  // 에디터에 표시할 텍스트
  const [content, setContent] = useState('');

  // 연결 상태 표시용 (connected / disconnected / reconnecting)
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>('disconnected');

  // OT 상태: 서버 revision (ref를 쓰는 이유 — 값 변경 시 리렌더링 불필요)
  const serverRevisionRef = useRef<number>(0);

  /**
   * inflightOps: 서버에 전송했으나 ack를 받지 못한 작업 배열
   *
   * ack가 오면 앞에서부터 하나씩 제거합니다.
   * remote op를 수신하면 이 배열의 모든 작업에 대해 transform합니다.
   */
  const inflightOpsRef = useRef<ClientOp[]>([]);

  /**
   * bufferOps: 아직 서버에 보내지 않은 로컬 작업 배열
   *
   * inflightOps가 모두 ack되면 이 배열을 서버로 전송합니다.
   * remote op를 수신하면 이 배열도 transform합니다.
   */
  const bufferOpsRef = useRef<TextOp[]>([]);

  // WebSocket 연결 객체
  const wsRef = useRef<WebSocket | null>(null);

  // 현재 로컬 텍스트 (ref로도 유지 — 이벤트 핸들러에서 최신값 참조용)
  const contentRef = useRef<string>('');

  // 재연결 타이머
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ──────────────────────────────────────────────────────────────
  // 서버로 작업 전송
  // ──────────────────────────────────────────────────────────────

  /**
   * [B5] bufferOps를 서버로 전송합니다.
   *
   * 호출 조건: inflightOps가 비어있을 때만 호출해야 합니다.
   * (한 번에 하나의 작업만 inflight 상태로 유지 — 단순 OT 구현)
   *
   * 호출 시점:
   *   - B4 이후 (로컬 편집 직후, inflight 없을 때)
   *   - C3 이후 (ack 수신으로 inflight 비었을 때)
   */
  const flushBuffer = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (bufferOpsRef.current.length === 0) return;
    if (inflightOpsRef.current.length > 0) return; // 아직 대기 중인 inflight 있으면 전송 보류

    // bufferOps를 모두 inflightOps로 이동하고 서버에 전송
    const opsToSend = bufferOpsRef.current.splice(0);
    const clientOps: ClientOp[] = opsToSend.map(op => ({
      ...op,
      revision: serverRevisionRef.current,
      opId: genOpId(),
    }));

    inflightOpsRef.current = clientOps;

    // 각 작업을 개별 메시지로 서버 전송 (→ 서버에서 C1 ack 응답)
    for (const clientOp of clientOps) {
      // 순서7번
      ws.send(JSON.stringify({ type: 'op', op: clientOp }));
      console.log(`[OT] → 서버 전송: ${clientOp.type} pos=${clientOp.position} rev=${clientOp.revision}`);
    }
  }, []);

  // ──────────────────────────────────────────────────────────────
  // WebSocket 연결 및 메시지 처리
  // ──────────────────────────────────────────────────────────────

  const connect = useCallback(() => {
    // [A2] WebSocket 연결 생성
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] 연결됨');
      setConnectionStatus('connected');
    };

    ws.onmessage = (event: MessageEvent) => {
      const message = JSON.parse(event.data);

      // ── [A3·A4] 초기화: 서버의 현재 문서 상태 수신 ──
      // 순서3번
      if (message.type === 'init') {
        // [A3] 서버로부터 { type: 'init', content, revision } 수신
        // [A4] content·serverRevision 초기화 → textarea 표시
        contentRef.current = message.content;
        setContent(message.content);
        serverRevisionRef.current = message.revision;
        console.log(`[OT] 초기화 — revision=${message.revision}`);
      }

      // ── [C1·C2·C3] ack: 내가 보낸 작업이 서버에서 승인됨 ──
      // 순서15번 - 클라이언트에서a ack 처리
      if (message.type === 'ack') {
        // [C1] 서버로부터 { type: 'ack', opId, revision } 수신
        // [C2] inflightOps에서 해당 opId 제거 + serverRevision 갱신
        inflightOpsRef.current = inflightOpsRef.current.filter(
          op => op.opId !== message.opId
        );
        serverRevisionRef.current = message.revision;
        console.log(`[OT] ack 수신 — revision=${message.revision}, inflight 남음=${inflightOpsRef.current.length}`);

        // [C3] inflightOps가 모두 처리됐으면 bufferOps를 서버로 전송
        if (inflightOpsRef.current.length === 0) {
          flushBuffer();
        }
      }

      // ── [D1~D5] remote op: 다른 사용자의 작업 수신 ──
      // 순서16번 - 클라이언트 remote op 처리
      if (message.type === 'op') {
        // [D1] 다른 사용자 op 수신: { type: 'op', op, revision }
        let remoteOp: TextOp = message.op;
        serverRevisionRef.current = message.revision;

        console.log(`[OT] remote op 수신: ${remoteOp.type} pos=${remoteOp.position} rev=${message.revision}`);

        /**
         * [OT 핵심] remote op를 내 pending 작업들에 대해 transform합니다.
         *
         * 왜 필요한가?
         *   서버는 remote op를 적용한 뒤의 문서 상태를 기준으로 내 작업을 transform합니다.
         *   클라이언트는 remote op 적용 전의 문서에 내 작업을 쌓아뒀습니다.
         *   remote op가 문서를 바꿨으므로 내 작업의 위치도 조정해야 합니다.
         *
         * 변환 방향:
         *   remoteOp' = transform(remoteOp, inflightOp1, inflightOp2, ...)
         *             → 내 inflight 작업들이 먼저 적용된 상태에서 remote op를 적용
         *   inflightOp' = transform(inflightOp, remoteOp)
         *             → remote op가 적용된 상태에서 내 작업을 적용
         */


        /**
         * 요약 remote -> inflight 기준 transform
         * */
        // [D2] remoteOp를 내 inflightOps에 대해 transform → remoteOp'
        //      (내가 이미 서버에 보낸 작업 위에 상대 작업을 올바르게 위치 조정)
        for (const inflightOp of inflightOpsRef.current) {
          remoteOp = transformOp(remoteOp, inflightOp);
        }

        // [D3] inflightOps를 원본 remoteOp에 대해 transform → inflightOps'
        //      (서버에서 상대 작업이 먼저 적용된 상태를 반영해 내 작업 위치 보정)
        let prevRemote = message.op as TextOp; // 원본 remote op
        inflightOpsRef.current = inflightOpsRef.current.map(inflightOp => {
          const newInflight = transformOp(inflightOp, prevRemote) as typeof inflightOp;
          prevRemote = transformOp(prevRemote, inflightOp);
          return newInflight;
        });

        // [D4] bufferOps를 변환된 remoteOp'에 대해 transform → bufferOps'
        //      (아직 서버에 보내지 않은 내 작업 위치도 동일하게 보정)
        bufferOpsRef.current = bufferOpsRef.current.map(bufOp => {
          const transformed = transformOp(bufOp, remoteOp);
          remoteOp = transformOp(remoteOp, bufOp);
          return transformed;
        });

        // [D5] 변환된 remoteOp'를 로컬 문서에 적용 → UI 업데이트
        // 순서17번 - 최종 적용
        const newContent = applyOp(contentRef.current, remoteOp);
        contentRef.current = newContent;
        setContent(newContent);

        console.log(`[OT] remote op 적용 완료 — 현재 문서 길이=${newContent.length}`);
      }
    };

    ws.onclose = () => {
      // wsRef.current가 이미 다른 연결로 교체됐으면 재연결하지 않음
      // (React StrictMode cleanup → 새 useEffect 순서로 인한 중복 연결 방지)
      if (wsRef.current !== ws) return;

      console.log('[WS] 연결 끊김 — 3초 후 재연결 시도');
      setConnectionStatus('reconnecting');

      // 자동 재연결 (3초 후)
      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = () => {
      console.error('[WS] 오류 발생');
      ws.close();
    };
  }, [flushBuffer]);

  // [A1] 컴포넌트 마운트 시 connect() 호출 → WebSocket 연결 시작
  // 순서1번
  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // ──────────────────────────────────────────────────────────────
  // 텍스트 입력 처리
  // ──────────────────────────────────────────────────────────────

  /**
   * [B1] 실제 텍스트 변경을 처리합니다.
   *
   * 처리 흐름:
   *   B1. processChange 호출 (onChange 또는 compositionEnd에서)
   *   B2. diffToOps(old, new) → 변경된 TextOp[] 계산
   *   B3. 로컬 문서·UI 즉시 업데이트 (사용자 반응성 확보)
   *   B4. 생성된 op를 bufferOps에 추가
   *   B5. flushBuffer() → inflight 없으면 서버 전송, 있으면 대기
   */
  const processChange = useCallback((newContent: string) => {
    const oldContent = contentRef.current;

    // 변화 없으면 무시
    if (newContent === oldContent) return;

    // [B2] diff: 이전↔새 텍스트 차이를 TextOp 목록으로 변환
    // 순서4번
    const ops = diffToOps(oldContent, newContent);

    if (ops.length === 0) return;

    // [B3] 로컬 문서·UI 즉시 업데이트 (서버 응답 기다리지 않고 먼저 반영)
    // 순서5번
    contentRef.current = newContent;
    setContent(newContent);

    // [B4] 생성된 op를 bufferOps에 추가 (전송 대기 큐)
    // 순서6번
    bufferOpsRef.current.push(...ops);

    // [B5] inflightOps 없으면 즉시 서버로 전송, 있으면 ack 후 자동 전송
    // 서버로 전송
    flushBuffer();
  }, [flushBuffer]);

  /**
   * onChange: IME 조합 중에는 화면 동기화만 하고, op 생성은 하지 않습니다.
   *
   * 브라우저 네이티브 nativeEvent.isComposing을 사용합니다.
   * (별도 ref를 쓰면 compositionEnd 미발화 시 ref가 true로 고착되어 입력 전체가 막힘)
   *
   * 조합 중(isComposing=true):
   *   - setContent만 호출 → React가 IME와 싸우지 않도록 화면을 맞춰줌
   *   - contentRef는 그대로 유지 → 조합 전 마지막 안정 상태 보존
   * 조합 완료(isComposing=false):
   *   - processChange → contentRef 기준 diff → OT op 생성 및 전송
   */
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if ((e.nativeEvent as InputEvent).isComposing) {
      // IME 조합 중: 화면만 갱신, op는 생성하지 않음
      setContent(e.target.value);
      return;
    }
    processChange(e.target.value);
  };

  /**
   * compositionEnd: 일부 브라우저/OS에서 compositionEnd 이후 onChange가
   * 발화되지 않는 경우를 대비해 여기서도 processChange를 직접 호출합니다.
   * (onChange가 발화되면 contentRef 기준 동일 값 → 중복 op 없음)
   */
  const handleCompositionEnd = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
    processChange((e.target as HTMLTextAreaElement).value);
  };

  // ──────────────────────────────────────────────────────────────
  // 렌더링
  // ──────────────────────────────────────────────────────────────

  /** 연결 상태 배지 색상 */
  const statusColor = {
    connected: '#4CAF50',
    disconnected: '#f44336',
    reconnecting: '#ff9800',
  }[connectionStatus];

  const statusLabel = {
    connected: '연결됨',
    disconnected: '연결 끊김',
    reconnecting: '재연결 중...',
  }[connectionStatus];

  return (
    <div style={{ padding: '20px' }}>
      <h1>실시간 공유 에디터 <span style={{ fontSize: '14px', fontWeight: 'normal', color: '#888' }}>(OT 방식)</span></h1>

      {/* 연결 상태 배지 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <span style={{
          display: 'inline-block',
          width: '10px', height: '10px',
          borderRadius: '50%',
          backgroundColor: statusColor,
        }} />
        <span style={{ fontSize: '13px', color: '#666' }}>{statusLabel}</span>
        <span style={{ fontSize: '12px', color: '#aaa', marginLeft: '8px' }}>
          revision: {serverRevisionRef.current}
        </span>
      </div>

      {/* OT 설명 배너 */}
      <div style={{
        background: '#e8f5e9',
        border: '1px solid #4CAF50',
        color: '#2e7d32',
        padding: '8px 14px',
        borderRadius: '6px',
        marginBottom: '12px',
        fontSize: '13px',
      }}>
        OT 방식: 동시 입력이 충돌 없이 모두 반영됩니다. 여러 탭에서 동시에 입력해보세요!
      </div>

      <textarea
        value={content}
        onChange={handleChange}
        onCompositionEnd={handleCompositionEnd}
        style={{
          width: '100%',
          height: '400px',
          fontSize: '16px',
          padding: '12px',
          boxSizing: 'border-box',
          border: '2px solid #4CAF50',
          borderRadius: '8px',
          resize: 'vertical',
          fontFamily: 'inherit',
          lineHeight: '1.6',
        }}
        placeholder="여기에 내용을 입력해보세요. 다른 탭에서도 동시에 입력해보세요!"
      />

      {/* 현재 OT 상태 디버그 정보 */}
      <div style={{ marginTop: '8px', fontSize: '12px', color: '#aaa' }}>
        inflight: {inflightOpsRef.current.length}개 &nbsp;|&nbsp;
        buffer: {bufferOpsRef.current.length}개
      </div>
    </div>
  );
}

export default EditorPage;
