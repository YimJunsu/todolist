/**
 * ot.ts — Operational Transformation (OT) 핵심 유틸리티
 *
 * ─────────────────────────────────────────────────────────────────
 * OT란?
 * ─────────────────────────────────────────────────────────────────
 * 여러 사용자가 동시에 같은 문서를 편집할 때 발생하는 충돌을
 * "거부" 없이 해결하는 알고리즘입니다.
 *
 * [기존 버전 번호 방식의 문제]
 *   A와 B가 동시에 입력하면 → 한 명이 "거부" 당하고 내용을 잃습니다.
 *
 * [OT 방식의 해결]
 *   A가 "3번 위치에 'X' 삽입", B가 "3번 위치에 'Y' 삽입"을 동시에 보내면
 *   → B의 작업을 "A 이후"에 맞게 변환 → "4번 위치에 'Y' 삽입"으로 조정
 *   → 두 작업 모두 반영됩니다 (거부 없음)
 *
 * ─────────────────────────────────────────────────────────────────
 * 핵심 개념
 * ─────────────────────────────────────────────────────────────────
 * - Operation(작업): 문서에 가하는 최소 단위 변경 (삽입 or 삭제)
 * - revision: 서버가 작업을 누적 적용한 횟수 (버전과 유사)
 * - transform(op1, op2): op2가 먼저 적용된 뒤 op1을 적용하려면
 *                        op1의 위치를 어떻게 조정해야 하는지 계산
 * ─────────────────────────────────────────────────────────────────
 */

// ──────────────────────────────────────────────────────────────────
// 타입 정의
// ──────────────────────────────────────────────────────────────────

/** 삽입 작업: position 위치에 text를 삽입합니다 */
export type InsertOp = {
  type: 'insert';
  position: number; // 삽입할 위치 (0-indexed)
  text: string;     // 삽입할 텍스트
};

/** 삭제 작업: position 위치에서 length 글자를 삭제합니다 */
export type DeleteOp = {
  type: 'delete';
  position: number; // 삭제 시작 위치 (0-indexed)
  length: number;   // 삭제할 글자 수
};

/** 텍스트 작업 = 삽입 또는 삭제 */
export type TextOp = InsertOp | DeleteOp;

/**
 * 클라이언트가 서버로 보내는 작업 메시지
 * TextOp에 메타정보를 추가한 형태입니다.
 */
export type ClientOp = TextOp & {
  revision: number; // 클라이언트가 기반하는 서버 revision 번호
                    // "나는 서버 revision N 상태에서 이 작업을 했어요"
  opId: string;     // 작업 고유 ID — 서버 ack 수신 시 매칭에 사용
};

// ──────────────────────────────────────────────────────────────────
// 작업 적용
// ──────────────────────────────────────────────────────────────────

/**
 * 문자열에 텍스트 작업을 적용하고 결과를 반환합니다.
 *
 * @example
 *   applyOp("hello", { type: 'insert', position: 5, text: ' world' })
 *   // → "hello world"
 *
 *   applyOp("hello world", { type: 'delete', position: 5, length: 6 })
 *   // → "hello"
 */
export function applyOp(content: string, op: TextOp): string {
  if (op.type === 'insert') {
    // 삽입: [앞부분] + [삽입텍스트] + [뒷부분]
    return content.slice(0, op.position) + op.text + content.slice(op.position);
  } else {
    // 삭제: [앞부분] + [삭제 이후 뒷부분]
    return content.slice(0, op.position) + content.slice(op.position + op.length);
  }
}

// ──────────────────────────────────────────────────────────────────
// OT 변환 (핵심)
// ──────────────────────────────────────────────────────────────────

/**
 * op1을 op2 이후에 올바르게 적용할 수 있도록 op1을 변환합니다.
 *
 * 전제: op2가 먼저 문서에 적용된 상태입니다.
 *       op1은 op2가 적용되기 이전 문서를 기반으로 만들어졌습니다.
 *       op1의 position을 op2의 영향을 반영해 조정합니다.
 *
 * @param op1    변환할 작업 (나중에 적용될 작업)
 * @param op2    먼저 적용된 작업 (기준)
 * @returns      조정된 op1
 */
export function transformOp(op1: TextOp, op2: TextOp): TextOp {
  // 4가지 경우(삽입×삽입, 삽입×삭제, 삭제×삽입, 삭제×삭제)를 각각 처리
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

/**
 * op1을 ops 배열의 모든 작업에 대해 순서대로 변환합니다.
 * 서버가 클라이언트의 작업을 히스토리에 있는 작업들에 맞게 변환할 때 사용합니다.
 */
export function transformAgainstAll(op: TextOp, ops: TextOp[]): TextOp {
  let result = op;
  for (const against of ops) {
    result = transformOp(result, against);
  }
  return result;
}

// ──────────────────────────────────────────────────────────────────
// 내부 변환 함수들 (각 경우별 상세 로직)
// ──────────────────────────────────────────────────────────────────

/**
 * [삽입 vs 삽입]
 *
 * 상황: op2가 먼저 어딘가에 텍스트를 삽입했습니다.
 *       op1도 어딘가에 텍스트를 삽입하려 합니다.
 *
 * 규칙:
 *   op2가 op1 위치 앞(또는 같은 위치)에 삽입 → op1 위치를 op2.text.length만큼 오른쪽으로
 *   op2가 op1 위치 뒤에 삽입              → op1 위치 변화 없음
 *
 * [같은 위치 규칙]
 *   동시에 같은 위치에 삽입하면 순서를 정해야 합니다.
 *   여기서는 "op2(서버에서 먼저 처리된 것)가 왼쪽" 규칙을 따릅니다.
 *   → op1의 위치를 오른쪽으로 밀어냅니다.
 */
function transformInsertInsert(op1: InsertOp, op2: InsertOp): InsertOp {
  if (op2.position <= op1.position) {
    // op2가 op1 앞(또는 같은 위치)에 삽입 → op1을 오른쪽으로 밀기
    return { ...op1, position: op1.position + op2.text.length };
  }
  // op2가 op1 뒤에 삽입 → op1 위치 그대로
  return op1;
}

/**
 * [삽입 vs 삭제]
 *
 * 상황: op2가 먼저 어딘가 텍스트를 삭제했습니다.
 *       op1은 어딘가에 텍스트를 삽입하려 합니다.
 *
 * 규칙:
 *   op2 삭제 범위가 op1 위치 앞에 있음 → op1 위치를 op2.length만큼 왼쪽으로
 *   op2 삭제 범위가 op1 위치 뒤에 있음 → op1 위치 변화 없음
 *   op2가 op1 위치를 포함하여 삭제    → op1을 삭제 시작점으로 이동
 */
function transformInsertDelete(op1: InsertOp, op2: DeleteOp): InsertOp {
  const op2End = op2.position + op2.length;

  if (op2End <= op1.position) {
    // 삭제가 삽입 위치 앞에서 완료됨 → 왼쪽으로 이동
    return { ...op1, position: op1.position - op2.length };
  } else if (op2.position >= op1.position) {
    // 삭제가 삽입 위치 뒤에서 시작됨 → 변화 없음
    return op1;
  }
  // 삭제 범위가 삽입 위치를 포함 → 삭제 시작점으로 이동
  return { ...op1, position: op2.position };
}

/**
 * [삭제 vs 삽입]
 *
 * 상황: op2가 먼저 어딘가에 텍스트를 삽입했습니다.
 *       op1은 어딘가 텍스트를 삭제하려 합니다.
 *
 * 규칙:
 *   op2가 op1 삭제 범위 앞에 삽입  → op1 위치를 오른쪽으로 이동
 *   op2가 op1 삭제 범위 뒤에 삽입  → op1 변화 없음
 *   op2가 op1 삭제 범위 안에 삽입  → op1 삭제 길이가 늘어남 (삽입된 텍스트도 삭제 대상)
 */
function transformDeleteInsert(op1: DeleteOp, op2: InsertOp): DeleteOp {
  if (op2.position <= op1.position) {
    // 삽입이 삭제 시작 앞(또는 같은 위치) → 삭제 위치를 오른쪽으로
    return { ...op1, position: op1.position + op2.text.length };
  } else if (op2.position >= op1.position + op1.length) {
    // 삽입이 삭제 범위 밖(뒤) → 변화 없음
    return op1;
  }
  // 삽입이 삭제 범위 안 → 삭제 길이를 늘려 삽입된 텍스트도 포함
  return { ...op1, length: op1.length + op2.text.length };
}

/**
 * [삭제 vs 삭제]
 *
 * 상황: op2가 먼저 어딘가 텍스트를 삭제했습니다.
 *       op1도 어딘가 텍스트를 삭제하려 합니다.
 *       두 삭제 범위가 겹칠 수 있습니다.
 *
 * 규칙 (겹치는 경우의 4가지 하위 케이스):
 *   완전히 앞에서 삭제  → op1 위치를 왼쪽으로
 *   완전히 뒤에서 삭제  → op1 변화 없음
 *   op2가 op1을 포함   → op1은 이미 삭제됨 (length=0)
 *   op1이 op2를 포함   → op1 길이에서 op2 길이를 뺌
 *   부분 겹침         → 겹치지 않는 부분만 삭제
 */
function transformDeleteDelete(op1: DeleteOp, op2: DeleteOp): DeleteOp {
  const op1End = op1.position + op1.length;
  const op2End = op2.position + op2.length;

  if (op2End <= op1.position) {
    // op2가 op1 완전히 앞에서 삭제 → op1 위치를 왼쪽으로
    return { ...op1, position: op1.position - op2.length };
  }

  if (op2.position >= op1End) {
    // op2가 op1 완전히 뒤에서 삭제 → op1 변화 없음
    return op1;
  }

  // 이하는 두 범위가 겹치는 경우

  if (op2.position <= op1.position && op2End >= op1End) {
    // op2가 op1을 완전히 포함 → op1이 삭제하려던 텍스트가 이미 없음
    return { ...op1, position: op2.position, length: 0 };
  }

  if (op2.position >= op1.position && op2End <= op1End) {
    // op1이 op2를 완전히 포함 → 중복 삭제된 부분(op2.length) 제외
    return { ...op1, length: op1.length - op2.length };
  }

  if (op2.position < op1.position) {
    // op2가 op1 앞쪽과 겹침 → op1의 앞부분이 이미 삭제됨
    // 남은 삭제 범위: op2End부터 op1End까지
    return { ...op1, position: op2.position, length: op1End - op2End };
  }

  // op2가 op1 뒤쪽과 겹침 → op1의 뒷부분이 이미 삭제됨
  // 남은 삭제 범위: op1.position부터 op2.position까지
  return { ...op1, length: op2.position - op1.position };
}
