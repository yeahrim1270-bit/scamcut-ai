"""규칙 기반 탐지(모델과 별개): 문장 분리, URL·도메인 위험도, 연락처·금액·기관명, 긴급 표현, 요청 문형.

여기서 나온 결과는 항상 source="rule" 로 표시되어 AI 모델 결과와 구분됩니다.
"""
import re
from dataclasses import dataclass
from typing import Optional

# ------------------------------------------------------------------ 문장 분리
@dataclass
class Seg:
    idx: int
    text: str
    start: int
    end: int


_URL_RE = re.compile(
    r"(?:https?://)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|net|org|kr|co\.kr|go\.kr|or\.kr|xyz|top|ly|gl|me|io|shop|click|icu|site|info|online|buzz|cyou|vip|live|at|gd|la|cc|link|app|store|tech|cn|run|work|life|fun|club|win|bid|tk|ml|ga|cf|gq|pw)(?::\d+)?(?:/[^\sㄱ-ㆎ가-힣]*)?",
    re.I,
)
_IP_URL_RE = re.compile(r"https?://[^\s가-힣\"'<>()]+", re.I)  # 스킴이 있는 주소는 모두 URL (IP·낯선 도메인 끝자리 포함)
_TAG_ONLY = re.compile(r"^\s*[\[\(（【][^\]\)）】]{0,20}[\]\)）】]\s*$")  # [Web발신] 같은 머리말
_BOUNDARY = re.compile(r"[.!?。…]+(?=\s|$)|\n+")


def segment(text: str) -> list[Seg]:
    """문장 단위로 나눕니다. URL 안의 점(.)에서는 끊지 않고, 원문 기준 위치(start/end)를 돌려줍니다."""
    masked = list(text)
    for m in list(_URL_RE.finditer(text)) + list(_IP_URL_RE.finditer(text)):
        for i in range(m.start(), m.end()):
            masked[i] = "x"
    mtext = "".join(masked)

    spans: list[tuple[int, int]] = []
    pos = 0
    for b in _BOUNDARY.finditer(mtext):
        spans.append((pos, b.end()))
        pos = b.end()
    spans.append((pos, len(text)))

    segs: list[Seg] = []
    for s, e in spans:
        # 구두점 없이 길게 이어진 문장은 쉼표에서 한 번 더 나눔
        parts = [(s, e)]
        if e - s > 110:
            parts, cur = [], s
            for c in re.finditer(r",\s*", mtext[s:e]):
                if s + c.end() - cur >= 40:
                    parts.append((cur, s + c.end()))
                    cur = s + c.end()
            parts.append((cur, e))
        for ps, pe in parts:
            raw = text[ps:pe]
            lead = len(raw) - len(raw.lstrip())
            trail = len(raw) - len(raw.rstrip())
            st, en = ps + lead, pe - trail
            t = text[st:en]
            if len(re.sub(r"[^0-9A-Za-z가-힣]", "", t)) < 2 or _TAG_ONLY.match(t):
                continue
            segs.append(Seg(len(segs), t, st, en))
    return segs


# ------------------------------------------------------------------ 엔티티
PHONE_RE = re.compile(r"(?<![\d-])(?:\+?82[-\s.]?|0)(?:1[016789]|2|[3-6][1-5]|70|80|50\d?)[-\s.)]?\d{3,4}[-\s.]?\d{4}(?![\d-])")
REP_NUMBER_RE = re.compile(r"(?<![\d-])1[5-8]\d{2}-?\d{4}(?![\d-])")
ACCOUNT_RE = re.compile(r"(?<![\d-])\d{2,6}-\d{2,6}-\d{2,8}(?:-\d{1,3})?(?![\d-])")
AMOUNT_RE = re.compile(r"(\d[\d,]*(?:\.\d+)?)\s*(억|천만|백만|만|천)?\s*원")
PERSON_RE = re.compile(r"([가-힣]{2,4})\s?(수사관|검사|팀장|과장|대리|주임|조사관|실장|부장|계장|경위|경감|형사|담당자)")


def _amount(num: str, unit: Optional[str]) -> int:
    try:
        n = float(num.replace(",", ""))
    except ValueError:
        return 0
    return int(n * {"억": 1e8, "천만": 1e7, "백만": 1e6, "만": 1e4, "천": 1e3}.get(unit or "", 1))


def extract_numbers(text: str) -> dict:
    phones = {re.sub(r"\D", "", m.group()) for m in PHONE_RE.finditer(text)} | {m.group().replace("-", "") for m in REP_NUMBER_RE.finditer(text)}
    phones = {("0" + p[2:]) if p.startswith("82") else p for p in phones}
    accounts = [m.group() for m in ACCOUNT_RE.finditer(text)]
    amounts = sorted({_amount(m.group(1), m.group(2)) for m in AMOUNT_RE.finditer(text) if _amount(m.group(1), m.group(2)) >= 1000})
    persons = sorted({f"{m.group(1)} {m.group(2)}" for m in PERSON_RE.finditer(text)})
    return {"phones": sorted(phones), "accounts": accounts, "amounts": amounts, "persons": persons}


# ------------------------------------------------------------------ 기관·업체 이름 (카테고리별)
ORGS: dict[str, list[str]] = {
    "imp_authority": ["서울중앙지검", "지방검찰청", "대검찰청", "검찰청", "검찰", "경찰청", "사이버수사대", "지능범죄수사대", "금융감독원", "금감원", "금융위원회", "국세청", "법원", "집행관실", "수사관", "수사팀"],
    "imp_finance": ["국민은행", "신한은행", "우리은행", "하나은행", "농협", "기업은행", "카카오뱅크", "토스", "새마을금고", "저축은행", "캐피탈", "신한카드", "삼성카드", "현대카드", "국민카드", "KB국민", "롯데카드", "하나카드", "증권사", "보험사"],
    "imp_courier": ["CJ대한통운", "대한통운", "한진택배", "롯데택배", "로젠택배", "우체국", "택배사", "택배 회사", "물류센터", "세관"],
    "imp_service": ["건강보험공단", "국민건강보험", "국민연금공단", "정부24", "교통민원24", "고용노동부", "주민센터", "네이버", "카카오", "쿠팡", "당근마켓", "통신사", "SKT", "KT", "LG유플러스"],
}
FAMILY_TERMS = ["엄마", "아빠", "어머니", "아버지", "아들", "딸", "여보", "이모", "삼촌", "고모", "조카", "형", "누나", "언니", "오빠", "막내", "친구야"]


def find_org(sentence: str, category: str) -> Optional[str]:
    if category == "imp_family":
        for t in FAMILY_TERMS:
            if t in sentence:
                return t
        return None
    for name in sorted(ORGS.get(category, []), key=len, reverse=True):
        if name.lower() in sentence.lower():
            return name
    return None


def find_all_orgs(text: str) -> list[dict]:
    out, seen = [], set()
    for cat, names in ORGS.items():
        for name in sorted(names, key=len, reverse=True):
            if name.lower() in text.lower() and name not in seen:
                seen.add(name)
                out.append({"name": name, "category": cat})
    return out


# ------------------------------------------------------------------ 긴급 표현
URGENCY_PHRASES = ["지금 바로", "지금 즉시", "즉시", "당장", "오늘 중", "오늘 안에", "오늘까지", "24시간", "10분 안에", "한 시간 내", "빨리", "서둘러", "시간이 없", "긴급", "급해", "급합니다", "마감", "만료", "기한 내", "마지막 기회", "곧바로", "자정까지"]
THREAT_PHRASES = ["구속영장", "체포", "압류", "동결", "법적 조치", "형사 처벌", "처벌", "정지", "불이익", "고발", "고소", "강제", "신용불량", "출국 금지", "경매"]
SECRECY_PHRASES = ["아무에게도", "비밀", "알리지", "말하지", "발설", "상의하지", "의논하지", "끊지 말", "통화를 끊지", "녹음", "삭제해"]


def find_phrase(sentence: str, phrases: list[str]) -> Optional[tuple[str, int, int]]:
    for p in phrases:
        i = sentence.find(p)
        if i >= 0:
            return p, i, i + len(p)
    return None


# ------------------------------------------------------------------ URL · 도메인 위험도
SHORTENERS = ["bit.ly", "han.gl", "me2.kr", "url.kr", "vo.la", "t.ly", "tinyurl.com", "shorturl.at", "goo.gl", "is.gd", "buly.kr", "c11.kr", "ln.run", "rb.gy", "cutt.ly", "ow.ly", "han.gl", "zrr.kr", "naver.me", "kakaolink.com"]
SUSPICIOUS_TLDS = [".xyz", ".top", ".click", ".shop", ".icu", ".site", ".online", ".buzz", ".cyou", ".vip", ".live", ".info", ".link", ".cc", ".cn", ".run", ".work", ".life", ".fun", ".club", ".win", ".bid", ".monster", ".rest", ".tk", ".ml", ".ga", ".cf", ".gq", ".pw"]
# 공식 주소로 알려진 도메인(등록 도메인 기준). 목록에 있어도 '안전 보증'이 아니라 위험도를 낮추는 참고 정보로만 씁니다.
OFFICIAL_DOMAINS = [
    "cjlogistics.com", "hanjin.com", "lotteglogis.com", "epost.go.kr", "logen.com", "coupang.com", "naver.com", "kakao.com",
    "kbstar.com", "shinhan.com", "wooribank.com", "hanabank.com", "nonghyup.com", "ibk.co.kr", "kakaobank.com", "toss.im",
    "hometax.go.kr", "gov.kr", "nhis.or.kr", "police.go.kr", "spo.go.kr", "fss.or.kr",
]
BRAND_TOKENS = ["cj", "hanjin", "lotte", "epost", "post", "logen", "coupang", "naver", "kakao", "kb", "kookmin", "shinhan", "woori", "hana", "nonghyup", "toss", "hometax", "gov", "police", "spo", "fss", "nhis", "delivery", "parcel", "track"]
GENERIC_BAIT = ["check", "verify", "secure", "safe", "login", "confirm", "auth", "update", "service", "support", "help", "info"]


def _registrable(host: str) -> str:
    parts = host.split(".")
    if len(parts) >= 3 and ".".join(parts[-2:]) in ("co.kr", "go.kr", "or.kr"):
        return ".".join(parts[-3:])
    return ".".join(parts[-2:]) if len(parts) >= 2 else host


def analyze_url(raw: str) -> dict:
    url = raw.rstrip(".,)")
    host = re.sub(r"^https?://", "", url, flags=re.I).split("/")[0].split(":")[0].lower()
    reg = _registrable(host)
    reasons: list[str] = []
    points = 0
    official = reg in OFFICIAL_DOMAINS or host in OFFICIAL_DOMAINS or host.endswith(".go.kr")
    if re.fullmatch(r"\d{1,3}(?:\.\d{1,3}){3}", host):
        points += 30
        reasons.append("IP 주소로 직접 연결")
    if host.startswith("xn--") or ".xn--" in host:
        points += 25
        reasons.append("유사 문자를 쓴 도메인(퓨니코드)")
    if any(host == s or host.endswith("." + s) for s in SHORTENERS):
        points += 20
        reasons.append("단축 주소(실제 목적지를 알 수 없음)")
    if any(host.endswith(t) for t in SUSPICIOUS_TLDS):
        points += 20
        reasons.append("스팸에 자주 쓰이는 도메인 끝자리")
    tokens = re.split(r"[.\-]", reg.split(".")[0])
    if not official:
        brand = [b for b in BRAND_TOKENS if b in host.replace("-", "").replace(".", "")]
        if brand and (len(tokens) > 1 or "-" in host or any(host.endswith(t) for t in SUSPICIOUS_TLDS)):
            points += 30
            reasons.append("공식 기관·업체 이름을 흉내 낸 주소 (공식 주소가 아님)")
        elif any(g in host for g in GENERIC_BAIT) and "-" in host:
            points += 15
            reasons.append("‘확인·인증’ 등을 붙인 낯선 주소")
    points = min(points, 45)
    if official:
        level, note = "low", "알려진 공식 주소와 일치합니다. 그래도 문자 속 링크 대신 공식 앱·홈페이지로 직접 접속하는 것이 안전합니다."
    elif points >= 30:
        level, note = "high", "; ".join(reasons)
    elif points >= 15:
        level, note = "medium", "; ".join(reasons)
    else:
        level, note = "unknown", "알 수 없는 주소입니다. 공식 주소인지 확인되기 전에는 접속하지 마세요."
    return {"url": url, "domain": host, "risk": level, "points": 0 if official else points, "reasons": reasons, "note": note, "official": official}


def extract_urls(text: str) -> list[dict]:
    seen, out = set(), []
    for m in sorted(list(_URL_RE.finditer(text)) + list(_IP_URL_RE.finditer(text)), key=lambda x: x.start()):
        info = analyze_url(m.group())
        if info["domain"] in seen or "." not in info["domain"]:
            continue
        seen.add(info["domain"])
        info.update(start=m.start(), end=m.end())
        out.append(info)
    return out


# ------------------------------------------------------------------ 요청 문형 규칙 (모델과 별개의 2차 확인)
_NEG = re.compile(r"((지|하지|주지|말지|마)\s?(마세요|마십시오|마시기|마라|말라|않습니다|않는|않으니|않아요|못합니다|맙시다)|(요구|문의|안내|요청|수집|권유)하지\s?(않|마)|금지|사기(입니다|이니|일|예요)|예방|주의하|조심|신고하|거절|응하지|포함되어 있지)")


def is_negated(sentence: str) -> bool:
    """'~하지 마세요', '요구하지 않습니다' 같은 경고·부정 표현이 있는 문장"""
    return bool(_NEG.search(sentence))
_REQ = re.compile(r"(주세요|주십시오|주시기|주시면|해 ?주|하세요|하십시오|하시오|바랍니다|바랄게|부탁|하셔야|해야 ?합니다|하시기 ?바|해줘|해라|하라|보내줘|알려줘|줘\b|읽어|열어|눌러|누르세요|들어가세요|세요\b)")

ACTION_RULES: dict[str, re.Pattern] = {
    "ask_transfer": re.compile(r"(송금|이체|입금|계좌로\s*(보내|옮)|계좌에\s*(넣|보내)|돈\s*(좀\s*)?(보내|부쳐|빌려))"),
    "ask_otp": re.compile(r"(인증\s?번호|인증\s?코드|OTP|otp|승인\s?번호|확인\s?코드|보안\s?코드|인증\s?문자|(문자|폰|휴대폰)(로|에)\s*(온|도착한)\s*(숫자|번호|코드))"),
    "ask_card_info": re.compile(r"(카드\s?번호|CVC|cvc|유효기간|카드\s?비밀번호|카드\s?정보|카드\s?(앞|뒷)면|보안\s?카드)"),
    "ask_personal_info": re.compile(r"(주민\s?(등록)?\s?번호|신분증|운전면허|계좌\s?번호|계좌\s?비밀번호|통장\s?사본|공동인증서|공인인증서|비밀번호|생년월일)"),
    "ask_app_install": re.compile(r"((설치|깔아|다운로드|내려받|실행).*(앱|어플|프로그램|apk|팀뷰어|애니데스크|원격|파일)|(앱|어플|프로그램|apk|팀뷰어|애니데스크|원격).*(설치|깔아|다운로드|내려받|실행))"),
    "ask_cash_gift": re.compile(r"(현금.*(전달|인출|찾아|보관|담아)|(인출|찾아).*현금|상품권|기프트\s?카드|핀\s?번호|금괴)"),
}
OTP_DELIVERED = re.compile(r"(인증|확인|승인|보안)\s?(번호|코드)[^0-9가-힣]{0,6}\d{4,8}|(OTP|otp)[^0-9가-힣]{0,6}\d{4,8}")
_OTP_GIVE = re.compile(r"(알려|불러|전달|보내|말씀|읽어|캡처|공유)")
_LINK_RULE = re.compile(r"(링크|주소|URL|url|사이트)\s*(를|을|에서|로)?\s*.{0,12}(클릭|눌러|누르|접속|열어|들어가|확인|수정|조회|납부|인증|입력|등록)")


# 서술형 결제 요구: '선입금 100만원이 필요합니다', '수수료를 내셔야 합니다' (요청 어미 없이 금액 지불을 요구)
_PAY_STATEMENT = re.compile(r"(선입금|선납|수수료|보증료|보증금|가입비|합의금|관세|세금|비용|위약금)[^.!?]{0,14}(필요합니다|내셔야|납부하셔야|지불하셔야|내야 ?합니다)")


def otp_delivery_notice(sentence: str) -> bool:
    return bool(OTP_DELIVERED.search(sentence)) and not _OTP_GIVE.search(sentence)


def rule_actions(sentence: str, has_url: bool) -> list[str]:
    """요청 문형 규칙. 경고·예방 문구(부정/주의 표현)는 제외합니다."""
    if _NEG.search(sentence):
        return []
    statement_pay = bool(_PAY_STATEMENT.search(sentence))
    if not _REQ.search(sentence) and not statement_pay:
        return []
    hits = [name for name, rx in ACTION_RULES.items() if rx.search(sentence)]
    if statement_pay and "ask_transfer" not in hits:
        hits.append("ask_transfer")
    if "ask_otp" in hits and OTP_DELIVERED.search(sentence) and not _OTP_GIVE.search(sentence):
        hits.remove("ask_otp")  # '인증번호 [482019] 를 입력해 주세요' 처럼 발송 안내문은 요구가 아님
    if (has_url or _LINK_RULE.search(sentence)) and re.search(r"(클릭|눌러|누르|접속|열어|들어가|확인|조회|납부|인증|수정)", sentence):
        hits.append("ask_link")
    return hits
