"use client";

// 앱 실행 화면: 흰 배경 한가운데 서비스 이름만 표시합니다. (정해진 시간 동안 표시, 건너뛰기 없음)
export default function SplashScreen() {
  return (
    <div className="launch" role="img" aria-label="SCAM CUT AI">
      <h1 className="launch-name">SCAM CUT AI</h1>
    </div>
  );
}
