"""블라인드 평가: python tests/eval_holdout.py

학습·튜닝에 쓰지 않은 새 문장 40개(위험 20 · 정상 20)로 일반화 성능을 확인합니다.
(pytest 수집 대상이 아닙니다. 결과는 표로 출력됩니다.)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from app.analyzers.base import EvidenceView  # noqa: E402
from app.ml.pipeline import analyze_evidence  # noqa: E402

LV = {"low": 0, "caution": 1, "high": 2}

# (설명, 문장, 기대 최소 수준, 반드시 포함할 행동)
MALICIOUS = [
    ("택배: 관세 미납 + 링크", "[국제발신] 고객님 앞으로 해외직구 택배가 도착했으나 관세 3,200원 미납으로 보관 중입니다. 납부: http://kr-customs-pay.cc/p", "caution", {"LINK"}),
    ("택배: 도메인만 있는 링크", "택배사입니다. 현관문 앞에 두었으나 반송 위험이 있어 주소 재확인 부탁드립니다. m.cj-redelivery.top", "caution", {"LINK"}),
    ("택배: 단축 URL", "[Web발신] 롯데택배 배송조회가 불가한 주소입니다 https://t.ly/Qx9aB 에서 정정해 주세요", "caution", {"LINK"}),
    ("가족: 액정 + 입금", "엄마 나 휴대폰 액정 깨져서 수리 맡겼어. 임시 폰이라 카톡 안 돼. 지금 급하게 쓸 데가 있는데 입금 좀 해줄 수 있어? 계좌는 카카오뱅크 3333-12-3456789", "high", {"TRANSFER"}),
    ("가족: 번호 변경 + 보험료", "아빠 나야, 번호 바뀌었어. 저장하고 문자 줘. 그리고 오늘 안에 보험료 70만원 대신 내줘 이 계좌로", "caution", {"TRANSFER"}),
    ("가족: 인증번호", "여보 나 폰 분실해서 동료 폰이야. 인증 때문에 그러는데 문자 오면 번호 좀 알려줘.", "caution", {"OTP"}),
    ("당국: 보안 앱 설치", "고객님 계좌에서 불법 자금이 확인되었습니다. 금융감독원 직원이 전화드리니 안내에 따라 보안 앱을 설치해 주세요.", "caution", {"APP_INSTALL"}),
    ("해킹 협박 + apk", "휴대폰이 해킹되었습니다. 지금 즉시 백신 앱을 다운로드하여 설치하셔야 피해를 막을 수 있습니다. 설치 파일: http://sec-guard.vip/app.apk", "high", {"APP_INSTALL"}),
    ("은행: 비밀번호·주민번호", "[카카오뱅크] 비정상 접속이 감지되어 계좌가 정지되었습니다. 본인 확인을 위해 계좌 비밀번호와 주민번호 뒷자리를 입력해 주세요.", "caution", {"PERSONAL_INFO"}),
    ("카드 정보 회신", "신용카드 한도 상향 심사 중입니다. 카드번호 16자리와 유효기간, 뒷면 3자리를 회신해 주세요.", "caution", {"CARD_INFO"}),
    ("검찰: 현금 전달", "검찰청입니다. 귀하는 보이스피싱 조직 계좌 개설 혐의로 입건되었습니다. 수사 협조를 위해 현금을 인출해 직원에게 전달해 주세요.", "high", {"CASH_GIFT"}),
    ("대출: 선입금", "정부 지원 대출 승인 완료. 신용 등급 상향을 위해 선입금 100만원이 필요합니다. 오늘 마감입니다.", "caution", {"TRANSFER"}),
    ("국세청: 환급 링크", "[국세청] 세금 환급금 65만원 발생. 환급 계좌 확인을 위해 아래 링크에서 신분증과 계좌번호를 등록해 주세요 https://nts-refund.xyz/go", "high", {"LINK"}),
    ("투자: 가입비", "리딩방 VIP 입장을 위해 가입비 50만원을 입금해 주세요. 수익은 100% 보장합니다.", "caution", {"TRANSFER"}),
    ("친구: 상품권", "나야 친구야 폰 바꿔서 번호 달라. 급하게 문화상품권 좀 사서 코드 보내줄래? 내일 바로 갚을게", "caution", {"CASH_GIFT"}),
    ("원격 점검 앱", "원격으로 점검해 드리겠습니다. 구글플레이에서 퀵서포트를 설치하고 화면에 뜨는 숫자를 불러주세요.", "caution", {"APP_INSTALL"}),
    ("경찰: 안전계좌", "경찰입니다. 귀하의 주민번호가 범죄에 도용되었습니다. 통화를 끊지 말고 계좌의 모든 예금을 안전계좌로 옮기세요.", "high", {"TRANSFER"}),
    ("자녀 합의금", "아들 학교 폭력 사건 관련해서 연락드립니다. 합의금 300만원을 지금 바로 입금해 주셔야 합니다.", "caution", {"TRANSFER"}),
    ("택배: 카드 결제 유도", "택배 반송 처리 직전입니다. 카드번호를 입력하시면 배송비 1,200원이 결제되고 재배송됩니다. https://kr-delivery.shop/pay", "high", {"CARD_INFO", "LINK"}),
    ("부고 스미싱", "[Web발신] 부고: 김OO님이 별세하셨기에 삼가 알려드립니다. 장례식장 안내 http://ln.run/abcd", "caution", {"LINK"}),
]

NORMAL = [
    ("롯데택배 배송 예정", "[롯데택배] 고객님의 상품이 오늘 오후 배송될 예정입니다. 부재 시 경비실에 맡기겠습니다."),
    ("배송 완료", "주문하신 상품이 배송 완료되었습니다. 문 앞에 놓아두었으니 확인해 주세요."),
    ("쿠팡 새벽배송", "[쿠팡] 로켓배송 상품이 새벽에 도착했습니다. 이용해 주셔서 감사합니다."),
    ("은행 인증번호 발송", "[우리은행] 인증번호 [391827] 를 화면에 입력해 주세요. 타인에게 알려주지 마세요."),
    ("카드 승인 알림", "[삼성카드] 2,450원 승인 (CU 서초점) 누적 사용금액 531,200원"),
    ("은행 보이스피싱 예방", "[신한은행] 보이스피싱 예방 안내 — 검찰·금감원은 전화로 계좌 이체나 앱 설치를 요구하지 않습니다."),
    ("엄마 일상", "엄마 오늘 병원 갔다 왔는데 괜찮대. 저녁에 전화할게."),
    ("회의록 공유", "회의록 정리해서 메일로 공유드렸습니다. 확인 부탁드립니다."),
    ("팀 미팅", "내일 오후 3시에 팀 미팅이 있습니다. 회의실은 5층입니다."),
    ("택배 수령 인사", "택배 잘 받았어요. 감사합니다 좋은 하루 보내세요."),
    ("건강검진 안내", "[국민건강보험] 건강검진 대상자 안내입니다. 검진 기관은 공단 홈페이지에서 직접 확인하세요."),
    ("회비 송금 완료", "친구야 어제 모임 회비 2만원 보냈어. 확인해 줘."),
    ("도서 출고", "[교보문고] 주문하신 도서가 출고되었습니다. 배송은 1~2일 소요됩니다."),
    ("통신요금 청구", "통신요금 청구서가 발행되었습니다. 이번 달 요금은 54,300원입니다."),
    ("카카오 인증번호", "[Web발신] [카카오] 인증번호는 [227461] 입니다. 인증번호를 타인에게 공유하지 마세요."),
    ("야근 연락", "오늘 야근이라 먼저 저녁 먹어. 늦으면 연락할게."),
    ("학부모 총회", "학부모 총회 안내 — 3월 12일 오후 2시 본교 강당에서 진행됩니다."),
    ("비밀번호 변경 완료", "비밀번호 변경이 완료되었습니다. 본인이 아니라면 고객센터로 문의해 주세요."),
    ("연말정산 서류", "[Web발신] 연말 정산 서류 제출 마감은 이번 주 금요일입니다. 사내 인트라넷에 업로드해 주세요."),
    ("가족 모임 예약", "이번 주말 가족 모임 장소는 강남 한식당으로 예약했어요."),
]


def main() -> int:
    texts = [c[1] for c in MALICIOUS] + [c[1] for c in NORMAL]
    items = [EvidenceView(id=f"e{i}", channel="sms", sender="", occurred_at="", content=t) for i, t in enumerate(texts)]
    ev = analyze_evidence(items)["evidence"]
    mal, nor = ev[: len(MALICIOUS)], ev[len(MALICIOUS) :]

    print("== 위험 문장 (20)")
    hit_level = hit_action = 0
    for (name, _, lvl, need), e in zip(MALICIOUS, mal):
        codes = {a["action"] for a in e["actions"]}
        ok_l, ok_a = LV[e["risk"]["level"]] >= LV[lvl], need <= codes
        hit_level += ok_l
        hit_action += ok_a
        print(f"  {'OK ' if ok_l and ok_a else 'MISS'} {name:24s} 수준={e['risk']['level']:7s}({e['risk']['score']:3d}) 행동={sorted(codes)} 필요={sorted(need)}")
    print("\n== 정상 문장 (20)")
    fp = 0
    for (name, _), e in zip(NORMAL, nor):
        flagged = e["risk"]["level"] != "low"
        fp += flagged
        print(f"  {'오탐' if flagged else 'OK '} {name:22s} 수준={e['risk']['level']:7s}({e['risk']['score']:3d}) 행동={[a['name'] for a in e['actions']]}")
    both = sum(LV[e["risk"]["level"]] >= LV[c[2]] and c[3] <= {a["action"] for a in e["actions"]} for e, c in zip(mal, MALICIOUS))
    print(f"\n[블라인드 결과] 위험 수준 기준 충족 {hit_level}/20 · 필요한 행동까지 모두 탐지 {both}/20 · 정상 문장 오탐 {fp}/20")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
