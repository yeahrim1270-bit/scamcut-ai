"""분류 라벨 정의와 사용자에게 보여 줄 한국어 설명."""
from dataclasses import dataclass

# 모델이 문장마다 판단하는 라벨 (순서는 학습된 가중치 파일과 일치해야 함 — weights/meta.json 에 함께 저장됨)
LABELS = [
    # 요청 행동
    "ask_transfer", "ask_otp", "ask_card_info", "ask_personal_info", "ask_link", "ask_app_install", "ask_cash_gift",
    # 압박
    "urgency", "threat", "secrecy",
    # 사칭 대상
    "imp_authority", "imp_finance", "imp_courier", "imp_family", "imp_service",
    # 주제
    "topic_delivery", "topic_legal", "topic_payment", "topic_money", "topic_family_emergency", "topic_account",
    # 정상 안내
    "benign",
]

ACTION_LABELS = ["ask_transfer", "ask_otp", "ask_card_info", "ask_personal_info", "ask_link", "ask_app_install", "ask_cash_gift"]
PRESSURE_LABELS = ["urgency", "threat", "secrecy"]
IMPERSONATION_LABELS = ["imp_authority", "imp_finance", "imp_courier", "imp_family", "imp_service"]
TOPIC_LABELS = ["topic_delivery", "topic_legal", "topic_payment", "topic_money", "topic_family_emergency", "topic_account"]


@dataclass(frozen=True)
class ActionInfo:
    code: str  # API 에 노출되는 행동 코드
    name: str  # 화면 표시 이름
    weight: int  # 위험 점수 가중치 (규칙 기반 종합 점수에만 사용)
    why: str  # 위험한 이유
    safe: str  # 안전한 대응 방법


ACTIONS: dict[str, ActionInfo] = {
    "ask_transfer": ActionInfo(
        "TRANSFER", "송금·이체 요구", 40,
        "송금은 되돌리기 어렵습니다. 사기범은 ‘안전계좌’, ‘수수료’, ‘보증금’ 같은 명목으로 돈을 먼저 보내게 합니다.",
        "송금을 멈추세요. 상대가 밝힌 기관이나 사람에게 직접 찾은 공식 번호로 다시 확인하세요. 이미 보냈다면 즉시 112 또는 은행 고객센터에 지급정지를 요청하세요.",
    ),
    "ask_otp": ActionInfo(
        "OTP", "인증번호 제공 요구", 35,
        "인증번호는 내 계정·계좌의 열쇠입니다. 알려 주면 상대가 나 대신 로그인하거나 결제할 수 있습니다.",
        "어떤 경우에도 인증번호를 알려주지 마세요. 내가 요청하지 않은 인증번호는 무시하고, 해당 서비스의 공식 고객센터에 문의하세요.",
    ),
    "ask_card_info": ActionInfo(
        "CARD_INFO", "카드정보 입력 요구", 35,
        "카드번호·유효기간·CVC·비밀번호가 넘어가면 무단 결제에 쓰일 수 있습니다.",
        "정보를 입력하지 마세요. 카드 뒷면의 공식 번호나 카드사 앱으로 직접 확인하세요. 이미 입력했다면 카드 사용 정지를 요청하세요.",
    ),
    "ask_personal_info": ActionInfo(
        "PERSONAL_INFO", "개인정보 입력 요구", 30,
        "주민등록번호·신분증·계좌정보·비밀번호가 유출되면 명의도용과 대출 사기에 악용될 수 있습니다.",
        "정보 제공을 멈추세요. 공식 앱이나 창구가 아닌 경로의 요청은 응하지 마세요. 이미 제공했다면 개인정보노출자 사고예방시스템(pd.fss.or.kr)에 등록하세요.",
    ),
    "ask_link": ActionInfo(
        "LINK", "링크 접속 요구", 15,
        "문자·메시지 속 링크는 가짜 사이트나 악성 앱 설치로 이어질 수 있습니다.",
        "링크를 누르지 말고, 공식 앱이나 직접 검색한 공식 홈페이지로 접속해 확인하세요. 이미 눌렀다면 입력한 정보가 없는지 확인하고 118에 상담하세요.",
    ),
    "ask_app_install": ActionInfo(
        "APP_INSTALL", "앱 설치·원격제어 요구", 40,
        "원격제어·악성 앱은 휴대폰을 장악해 인증번호와 금융 앱 정보를 빼갈 수 있습니다.",
        "설치를 중단하세요. 공식 앱 마켓 이외의 설치 요구는 따르지 마세요. 이미 설치했다면 비행기 모드로 전환 → 앱 삭제 → 118 상담 순서로 대응하세요.",
    ),
    "ask_cash_gift": ActionInfo(
        "CASH_GIFT", "현금·상품권 전달 요구", 35,
        "현금 전달이나 상품권 핀번호 전송은 즉시 현금화되어 되찾기 어렵습니다.",
        "전달을 멈추세요. 기관 직원이 현금을 받으러 오는 일은 없습니다. 이미 전달했다면 즉시 112에 신고하세요.",
    ),
}

LABEL_KO = {
    "urgency": "긴급성 압박", "threat": "위협·불이익 언급", "secrecy": "비밀 유지 요구",
    "imp_authority": "수사·금융당국", "imp_finance": "금융회사", "imp_courier": "택배사", "imp_family": "가족·지인", "imp_service": "공공·플랫폼 서비스",
    "topic_delivery": "택배·배송", "topic_legal": "수사·사건 연루", "topic_payment": "결제·승인", "topic_money": "대출·투자·알바",
    "topic_family_emergency": "가족 긴급 상황", "topic_account": "계정·계좌 보안",
    "benign": "일반 안내",
}
