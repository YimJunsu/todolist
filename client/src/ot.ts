/**
 * ot.ts (클라이언트) — Operational Transformation 유틸리티
 *
 * 서버의 server/src/ot.ts와 동일한 변환 로직입니다.
 * 클라이언트에서 remote op를 수신했을 때 자신의 pending 작업을
 * 올바르게 조정하는 데 사용합니다.
 *
 * ─────────────────────────────────────────────────────────────────
 * 클라이언트 OT 상태 머신
 * ─────────────────────────────────────────────────────────────────
 *
 *   [상태 변수]
 *   - serverRevision : 마지막으로 ack된 서버 revision
 *   - inflightOp     : 서버에 보냈지만 아직 ack를 받지 못한 작업
 *   - bufferOp       : 로컬 편집으로 생성됐지만 아직 서버에 보내지 않은 작업
 *
 *   [로컬 편집 시]
 *   1. 텍스트 diff → TextOp 생성
 *   2. bufferOp에 합성(compose)
 *   3. inflightOp이 없으면 즉시 서버로 전송 (inflightOp으로 이동)
 *
 *   [서버 ack 수신 시]
 *   1. serverRevision 갱신
 *   2. inflightOp = null
 *   3. bufferOp가 있으면 서버로 전송 (inflightOp으로 이동)
 *
 *   [서버 remote op 수신 시]
 *   1. remoteOp를 inflightOp에 대해 transform → remoteOp'
 *   2. inflightOp을 remoteOp에 대해 transform → inflightOp'
 *   3. bufferOp를 remoteOp'에 대해 transform → bufferOp'
 *   4. remoteOp'를 로컬 문서에 적용
 *   5. serverRevision 갱신
 * ─────────────────────────────────────────────────────────────────
 */

// ──────────────────────────────────────────────────────────────────
// 타입 정의 (서버와 동일)
// ──────────────────────────────────────────────────────────────────

export type InsertOp = {
  type: 'insert';
  position: number;
  text: string;
};

export type DeleteOp = {
  type: 'delete';
  position: number;
  length: number;
};

export type TextOp = InsertOp | DeleteOp;

// ──────────────────────────────────────────────────────────────────
// 작업 적용
// ──────────────────────────────────────────────────────────────────

/** 문자열에 텍스트 작업을 적용하고 결과를 반환합니다 */
export function applyOp(content: string, op: TextOp): string {
  if (op.type === 'insert') {
    return content.slice(0, op.position) + op.text + content.slice(op.position);
  } else {
    return content.slice(0, op.position) + content.slice(op.position + op.length);
  }
}

// ──────────────────────────────────────────────────────────────────
// OT 변환
// ──────────────────────────────────────────────────────────────────

/**
 * op1을 op2가 먼저 적용된 상태에서 올바르게 적용할 수 있도록 op1을 변환합니다.
 */
export function transformOp(op1: TextOp, op2: TextOp): TextOp {
  if (op1.type === 'insert' && op2.type === 'insert') {
    return transformInsertInsert(op1, op2);
  } else if (op1.type === 'insert' && op2.type === 'delete') {
    return transformInsertDelete(op1, op2);
  } else if (op1.type === 'delete' && op2.type === 'insert') {
    return transformDeleteInsert(op1, op2);
  } else {
    return transformDeleteDelete(op1 as DeleteOp, op2 as DeleteOp);
  }
}

// ──────────────────────────────────────────────────────────────────
// diff 유틸리티: 이전/다음 텍스트로부터 작업 목록을 추출합니다
// ──────────────────────────────────────────────────────────────────

/**
 * 이전 텍스트와 새 텍스트를 비교하여 TextOp 목록을 반환합니다.
 *
 * 알고리즘:
 *   1. 앞에서부터 같은 글자 수(commonPrefixLen) 계산
 *   2. 뒤에서부터 같은 글자 수(commonSuffixLen) 계산
 *   3. 중간에서 달라진 부분만 비교
 *      → 구버전에 텍스트가 있으면 delete op 생성
 *      → 새버전에 텍스트가 있으면 insert op 생성
 *
 * @example
 *   diffToOps("hello", "hello world")
 *   // → [{ type: 'insert', position: 5, text: ' world' }]
 *
 *   diffToOps("hello world", "hi world")
 *   // → [{ type: 'delete', position: 1, length: 4 },
 *   //    { type: 'insert', position: 1, text: 'i' }]
 */
// 순서 4번 op 변환
export function diffToOps(oldContent: string, newContent: string): TextOp[] {
  // 공통 앞부분 길이
  let start = 0;
  while (
    start < oldContent.length &&
    start < newContent.length &&
    oldContent[start] === newContent[start]
  ) {
    start++;
  }

  // 공통 뒷부분 길이 (start 이후에서만 계산)
  let oldEnd = oldContent.length;
  let newEnd = newContent.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    oldContent[oldEnd - 1] === newContent[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }

  const ops: TextOp[] = [];

  // 구버전에만 있는 부분 → 삭제
  if (oldEnd > start) {
    ops.push({
      type: 'delete',
      position: start,
      length: oldEnd - start,
    });
  }

  // 새버전에만 있는 부분 → 삽입
  // 삭제 후 삽입이므로 position은 start 그대로
  if (newEnd > start) {
    ops.push({
      type: 'insert',
      position: start,
      text: newContent.slice(start, newEnd),
    });
  }

  return ops;
}

/**
 * 두 작업을 하나로 합성합니다 (compose).
 *
 * 연속적인 편집을 하나의 작업으로 합칩니다.
 * 예: 'delete(5,1)' 후 'insert(5,"X")' → 한 번에 처리
 *
 * 단순화: 여기서는 delete+insert를 합성하지 않고 배열로 유지합니다.
 * 실제로는 서버에 한 번에 하나씩만 보내므로 충분합니다.
 */
export function composeOps(ops: TextOp[]): TextOp[] {
  // 현재 구현에서는 그대로 반환 (각각 순서대로 서버에 전송)
  return ops;
}

// ──────────────────────────────────────────────────────────────────
// 내부 변환 함수들 (서버와 동일한 로직)
// ──────────────────────────────────────────────────────────────────

function transformInsertInsert(op1: InsertOp, op2: InsertOp): InsertOp {
  if (op2.position <= op1.position) {
    return { ...op1, position: op1.position + op2.text.length };
  }
  return op1;
}

function transformInsertDelete(op1: InsertOp, op2: DeleteOp): InsertOp {
  const op2End = op2.position + op2.length;
  if (op2End <= op1.position) {
    return { ...op1, position: op1.position - op2.length };
  } else if (op2.position >= op1.position) {
    return op1;
  }
  return { ...op1, position: op2.position };
}

function transformDeleteInsert(op1: DeleteOp, op2: InsertOp): DeleteOp {
  if (op2.position <= op1.position) {
    return { ...op1, position: op1.position + op2.text.length };
  } else if (op2.position >= op1.position + op1.length) {
    return op1;
  }
  return { ...op1, length: op1.length + op2.text.length };
}

function transformDeleteDelete(op1: DeleteOp, op2: DeleteOp): DeleteOp {
  const op1End = op1.position + op1.length;
  const op2End = op2.position + op2.length;

  if (op2End <= op1.position) {
    return { ...op1, position: op1.position - op2.length };
  }
  if (op2.position >= op1End) {
    return op1;
  }
  if (op2.position <= op1.position && op2End >= op1End) {
    return { ...op1, position: op2.position, length: 0 };
  }
  if (op2.position >= op1.position && op2End <= op1End) {
    return { ...op1, length: op1.length - op2.length };
  }
  if (op2.position < op1.position) {
    return { ...op1, position: op2.position, length: op1End - op2End };
  }
  return { ...op1, length: op2.position - op1.position };
}
