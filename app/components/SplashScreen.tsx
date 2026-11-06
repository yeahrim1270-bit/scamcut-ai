"use client";

// 앱 실행 화면: 준비된 시작 이미지를 전체 화면으로 보여 줍니다. (정해진 시간 동안 표시, 건너뛰기 없음)
export default function SplashScreen() {
  return (
    <div className="launch" role="img" aria-label="SCAM CUT AI">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="launch-img" src="/images/launch.jpg" alt="" width={900} height={1147} draggable={false} />
    </div>
  );
}
