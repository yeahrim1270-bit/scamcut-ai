// 데모용 "입력 예시" (분석 결과가 아니라 사용자가 붙여넣을 법한 원자료입니다)
// 모든 번호·계좌·이름은 가상의 값입니다.

import type { EvidenceItem } from "./types";

export interface SampleSet {
  name: string;
  items: Omit<EvidenceItem, "id">[];
}

export const SAMPLE_SETS: SampleSet[] = [
  {
    name: "기관 사칭 + 무관 자료 섞임",
    items: [
      {
        channel: "sms",
        sender: "02-3480-1234",
        occurredAt: "2026-11-04T09:12",
        content: "[Web발신] 서울중앙지검 김민수 수사관입니다. 귀하 명의 계좌가 금융범죄 사건에 연루되어 확인이 필요합니다. 오늘 중 02-3480-1234로 연락 바랍니다. 미응답 시 출석요구서가 발부됩니다.",
      },
      {
        channel: "call",
        sender: "02-3480-1234",
        occurredAt: "2026-11-04T09:40",
        content: "김민수 수사관이라며 내 명의로 대포통장이 개설됐다고 함. 구속영장 얘기하면서 수사중이니 가족에게도 절대 말하지 말라고 함. 자산보호를 위해 보안 앱을 설치하라고 링크를 보내준다고 함.",
      },
      {
        channel: "email",
        sender: "금감원 박정훈 팀장",
        occurredAt: "2026-11-04T10:05",
        content: "김민수 수사관님께 전달받았습니다. 자산보호 절차 진행합니다. http://fss-safe.xyz/app 에서 보안앱 설치 후, 국가안전계좌 우리은행 1002-345-678901 로 오늘 안에 이체하세요. 인증번호 오면 저에게 바로 알려주세요.",
      },
      {
        channel: "sms",
        sender: "1588-1255",
        occurredAt: "2026-11-04T13:20",
        content: "[CJ대한통운] 고객님의 상품이 오늘 14~16시 사이 배송 예정입니다. 감사합니다.",
      },
    ],
  },
  {
    name: "가족 사칭 이메일",
    items: [
      {
        channel: "sms",
        sender: "010-9876-5432",
        occurredAt: "2026-11-05T15:02",
        content: "엄마 나야 폰 액정이 깨져서 수리 맡겼어 이 번호로 카톡 추가해줘 010-9876-5432",
      },
      {
        channel: "email",
        sender: "딸(새번호)",
        occurredAt: "2026-11-05T15:10",
        content: "엄마 급해 지금 인증이 안돼서 그런데 엄마 신분증 사진이랑 카드번호 좀 보내줘. 그리고 문화상품권 50만원만 대신 결제해줘 핀번호 보내주면 돼. 아빠한테는 말하지마",
      },
      {
        channel: "call",
        sender: "010-9876-5432",
        occurredAt: "2026-11-05T15:25",
        content: "전화 걸었더니 안 받고 문자로 지금 통화 못한다고 빨리 보내달라고만 함",
      },
    ],
  },
];
