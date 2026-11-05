"""AI 분석 정확도 검증 (오탐 확인 포함).

- 학습 데이터(app/ml/data)에 없는 문장으로 구성한 개발용 검증 세트입니다.
- 요구 시나리오: 택배 사칭 · 가족 사칭 송금 요구 · 정상 배송 안내 · 원격제어 앱 설치 요구
- '정상 안내를 위험으로 판정하지 않는지'(오탐)를 별도로 집계합니다.
"""
import pytest

from app.analyzers.base import EvidenceView
from app.ml.encoder import OnnxEncoder
from app.ml.heads import weights_present
from app.ml.pipeline import analyze_evidence

pytestmark = pytest.mark.skipif(
    not (OnnxEncoder.files_present() and weights_present()),
    reason="AI 모델 파일이 없어 건너뜁니다 (npm run setup:model / train:model)",
)

LEVELS = {"low": 0, "caution": 1, "high": 2}

# (이름, 문장, 기대 최소 수준, 반드시 포함돼야 할 행동 코드)
MALICIOUS = [
    ("택배 사칭: 위장 도메인 링크", "[Web발신] [CJ대한통운] 고객님의 택배가 주소 불일치로 반송 예정입니다. 주소 수정: http://cj-parcel-kr.xyz/addr", "high", {"LINK"}),
    ("택배 사칭: 통관 + 개인정보", "[우체국] 해외에서 발송된 소포가 통관 보류 중입니다. 24시간 내 아래 링크에서 개인정보를 입력해 주세요. https://epost-customs.top/in", "high", {"LINK"}),
    ("택배 사칭: 단축 URL", "택배 배송 실패 안내입니다. 확인하세요 https://bit.ly/3xYzAbC", "caution", {"LINK"}),
    ("가족 사칭: 송금 요구", "엄마 나 폰 고장나서 친구 폰으로 문자해. 급하게 결제할 게 있는데 이 계좌로 85만원만 먼저 보내줘. 국민은행 123456-01-123456", "high", {"TRANSFER"}),
    ("가족 사칭: 인증번호 요구", "엄마 나야 폰이 이상해서 인증이 안 돼. 문자로 온 인증번호 좀 알려줘.", "caution", {"OTP"}),
    ("가족 사칭: 상품권 요구", "엄마 문화상품권 30만원어치 사서 핀번호 사진 보내줘 급해", "caution", {"CASH_GIFT"}),
    ("원격제어 앱 설치(당국 사칭)", "[금융감독원] 고객님 계좌가 범죄에 이용되었습니다. 보안 점검을 위해 원격제어 앱 팀뷰어를 설치하고 접속 코드를 알려주세요.", "high", {"APP_INSTALL"}),
    ("원격제어 앱 설치(은행 사칭)", "저는 은행 보안팀입니다. 휴대폰 점검이 필요하니 애니데스크를 설치하고 화면 공유를 켜 주세요.", "high", {"APP_INSTALL"}),
    ("검찰 사칭: 안전계좌 이체", "서울중앙지검 김철수 수사관입니다. 귀하의 명의가 대포통장 사건에 연루되었습니다. 오늘 중으로 안전계좌로 자금을 이체하지 않으면 구속영장이 발부됩니다. 이 사실은 가족에게도 말하지 마세요.", "high", {"TRANSFER"}),
    ("카드정보 입력 요구", "해외 결제 승인 79만원 본인이 아니면 카드번호와 CVC를 입력해 취소하세요.", "caution", {"CARD_INFO"}),
    ("대출 사기: 선입금", "저금리 대환대출 승인 대상자입니다. 보증료 30만원을 먼저 입금하시면 오늘 바로 실행됩니다.", "caution", {"TRANSFER"}),
    ("개인정보 요구(공공기관 사칭)", "[건강보험공단] 환급금 42만원이 있습니다. 신분증 사진과 계좌번호를 보내주세요.", "caution", {"PERSONAL_INFO"}),
]

NORMAL = [
    ("정상 배송: 배송 예정", "[CJ대한통운] 고객님의 택배가 오늘 오후 2시~4시 사이 배송 예정입니다. 감사합니다."),
    ("정상 배송: 배송 완료", "[로젠택배] 상품이 배송 완료되었습니다. 문 앞에 놓아두었습니다."),
    ("정상 배송: 출고 안내", "주문하신 상품이 출고되었습니다. 내일 도착 예정이며 배송 조회는 택배사 앱에서 가능합니다."),
    ("정상 배송: 공식 조회 링크", "[한진택배] 오늘 배송 예정입니다. 배송조회 https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do"),
    ("정상: 인증번호 발송", "[Web발신] [네이버] 인증번호 [482019] 를 입력해 주세요. 타인에게 절대 알려주지 마세요."),
    ("정상: 은행 입금 알림", "[KB국민은행] 입금 500,000원 급여 이체가 완료되었습니다. 잔액 1,234,000원"),
    ("정상: 은행 보안 경고", "KB국민은행 안내: 금융기관은 전화나 문자로 개인정보와 인증번호를 요구하지 않습니다. 보이스피싱에 주의하세요."),
    ("정상: 가족 일상 대화", "엄마 오늘 저녁에 갈게. 맛있는 거 해줘."),
    ("정상: 가족 정산", "아빠 생신 선물값은 내가 먼저 냈어. 나중에 정산하자."),
    ("정상: 광고", "[광고] 겨울 맞이 할인 행사 안내입니다. 수신거부 080-123-4567"),
    ("정상: 병원 예약", "내일 오전 10시 치과 예약이 있습니다. 변경이 필요하시면 전화 주세요."),
    ("정상: 앱 업데이트", "새 버전이 출시되었습니다. 앱스토어에서 업데이트해 주세요."),
    ("정상: 고지서", "건강보험료 고지서가 발송되었습니다. 납부 기한은 이달 25일입니다."),
    ("정상: 주문 접수", "주문이 접수되었습니다. 결제 금액은 32,000원입니다."),
    ("정상: 업무 일정", "프로젝트 마감은 금요일입니다. 일정에 맞춰 진행해 주세요."),
    ("정상: 카드 승인 알림", "[신한카드] 12,300원 일시불 승인 (GS25 역삼점)"),
]


def _run(texts: list[str]):
    items = [EvidenceView(id=f"e{i}", channel="sms", sender="", occurred_at="", content=t) for i, t in enumerate(texts)]
    return analyze_evidence(items)["evidence"]


@pytest.fixture(scope="module")
def mal():
    return _run([c[1] for c in MALICIOUS])


@pytest.fixture(scope="module")
def nor():
    return _run([c[1] for c in NORMAL])


@pytest.mark.parametrize("i", range(len(MALICIOUS)), ids=[c[0] for c in MALICIOUS])
def test_malicious_detected(mal, i):
    name, text, min_level, need = MALICIOUS[i]
    ev = mal[i]
    codes = {a["action"] for a in ev["actions"]}
    assert LEVELS[ev["risk"]["level"]] >= LEVELS[min_level], f"{name}: 수준 {ev['risk']['level']}({ev['risk']['score']}) < {min_level}"
    assert need <= codes, f"{name}: 필요한 행동 {need} 중 탐지 {codes}"


@pytest.mark.parametrize("i", range(len(NORMAL)), ids=[c[0] for c in NORMAL])
def test_normal_not_flagged(nor, i):
    name, text = NORMAL[i]
    ev = nor[i]
    assert ev["risk"]["level"] == "low", f"{name}: 오탐 — {ev['risk']['label']}({ev['risk']['score']}) 행동 {[a['name'] for a in ev['actions']]}"
    assert ev["classification"]["kind"] == "normal_notice", f"{name}: 분류 {ev['classification']['label']}"


def test_accuracy_summary(mal, nor, capsys):
    tp = sum(LEVELS[e["risk"]["level"]] >= LEVELS[c[2]] and c[3] <= {a["action"] for a in e["actions"]} for e, c in zip(mal, MALICIOUS))
    fp = sum(e["risk"]["level"] != "low" for e in nor)
    with capsys.disabled():
        print(f"\n[정확도] 위험 문장 탐지 {tp}/{len(MALICIOUS)} · 정상 문장 오탐 {fp}/{len(NORMAL)}")
    assert fp == 0


def test_every_result_item_has_source_and_evidence(mal):
    """모든 탐지 항목에는 출처(model/rule)와 원문 근거 문장이 있어야 합니다."""
    for ev in mal:
        text = ev["sentences"] and "".join(s["text"] for s in ev["sentences"])
        for a in ev["actions"]:
            assert a["source"] in ("model", "rule", "model+rule")
            assert a["evidence"], "행동 탐지에는 근거 문장이 필요합니다"
            for h in a["evidence"]:
                assert h["text"].strip() and h["end"] > h["start"] and h["source"] in ("model", "rule", "model+rule")
        for group in (ev["impersonation"], ev["urgency"], ev["threats"], ev["secrecy"]):
            for g in group:
                assert g["source"] in ("model", "rule", "model+rule") and g["text"].strip()


def test_results_depend_on_input():
    """같은 구조의 입력이라도 내용에 따라 결과가 달라져야 합니다(고정 결과가 아님)."""
    a, b, c = _run(["안전계좌로 지금 바로 500만원을 이체해 주세요.", "팀뷰어를 설치하고 접속 번호를 알려주세요.", "오늘 점심에 뭐 먹을까?"])
    assert {x["action"] for x in a["actions"]} != {x["action"] for x in b["actions"]}
    assert c["risk"]["level"] == "low" and not c["actions"]
    assert a["risk"]["score"] != c["risk"]["score"]


def test_spans_point_into_original_text():
    text = "[Web발신] 지금 바로 링크를 눌러 확인하세요. http://bit.ly/abcd1234 감사합니다."
    ev = _run([text])[0]
    for s in ev["sentences"]:
        assert text[s["start"] : s["end"]] == s["text"]
    u = ev["entities"]["urls"][0]
    assert text[u["start"] : u["end"]].startswith("http://bit.ly") and u["risk"] in ("high", "medium")
