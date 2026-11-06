"use client";

import { useState } from "react";
import { stepData, type ActionGuardData, type Level, type MultiScanData } from "@/lib/analysis";
import { isActiveJob, type AnalysisStep, type AnalyzerInfo, type AnalyzerKey } from "@/lib/models";
import { href } from "@/lib/route";
import type { Store } from "@/lib/store";
import AiFlowPanel from "./AiFlowPanel";
import { ActionGuardView, MultiScanView, WarningBanner } from "./AnalysisViews";
import { Empty, IncidentCard, Notice, TabBar, TopBar, fmtDate, fmtDateTime } from "./common";
import { Icon, type IconName } from "./icons";

const SECTIONS: { api: AnalyzerKey; name: string; icon: IconName; desc: string }[] = [
  { api: "multi_scan", name: "MULTI SCAN", icon: "search", desc: "사칭 대상·주제·URL·긴급성·요청 행동 추출" },
  { api: "scam_flow", name: "SCAM FLOW", icon: "network", desc: "자료 간 연관성 및 사건 흐름" },
  { api: "action_guard", name: "ACTION GUARD", icon: "shield-check", desc: "송금·인증번호·개인정보·의심 링크·앱 설치 요구 탐지" },
  { api: "safe_verify", name: "SAFE VERIFY", icon: "bank", desc: "공식 경로 확인 및 안전 대응 안내" },
];

const NOT_IMPLEMENTED = "ANALYZER_NOT_IMPLEMENTED";

// 영역별 상태 배지: 서버의 분석 단계 상태와, 분석기 구현 여부(capabilities)를 그대로 반영
function badge(step: AnalysisStep | undefined, cap: AnalyzerInfo | undefined): { text: string; cls: string } {
  if (!step) {
    if (cap && !cap.implemented) return { text: "준비 중", cls: "" };
    if (cap && !cap.ready) return { text: "모델 준비 필요", cls: "failed" };
    return { text: "분석 대기", cls: "" };
  }
  if (step.status === "pending") return { text: "대기 중", cls: "" };
  if (step.status === "running") return { text: "분석 중", cls: "running" };
  if (step.status === "succeeded") return { text: "결과 있음", cls: "done" };
  return step.errorCode === NOT_IMPLEMENTED ? { text: "준비 중", cls: "" } : { text: "실패", cls: "failed" };
}

// 분석 결과 화면: 분석 요청의 대기·진행·성공·실패 상태를 서버와 연결해 표시합니다.
// 서버(AI 모델·규칙)가 돌려준 결과가 있을 때만 영역에 내용을 표시하며, 앱에서 결과를 만들어 내지 않습니다.
export default function AnalysisScreen({
  incidentId,
  store,
  go,
  back,
}: {
  incidentId: string;
  store: Store;
  go: (to: string) => void;
  back: (fallback: string) => void;
}) {
  const [requesting, setRequesting] = useState(false);
  const incident = store.db.incidents.find((i) => i.id === incidentId);
  if (!incident) {
    return (
      <>
        <TopBar title="분석 결과" onBack={() => go(href.incidents)} />
        <main className="page">
          <Empty icon="search" title="사건을 찾을 수 없습니다" desc="삭제되었거나 잘못된 주소입니다.">
            <a className="btn primary" href={href.incidents}>사건 목록으로</a>
          </Empty>
        </main>
        <TabBar active="history" />
      </>
    );
  }

  const items = store.db.evidence.filter((e) => e.incidentId === incidentId);
  const jobs = store.db.jobs.filter((j) => j.incidentId === incidentId); // 최신순
  const latestJob = jobs[0];
  const active = !!latestJob && isActiveJob(latestJob);
  const records = store.db.analyses.filter((a) => a.incidentId === incidentId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latest = records[0];
  const caps = new Map(store.capabilities.map((c) => [c.key, c]));
  const notImplemented = store.capabilities.filter((c) => !c.implemented);
  const notReady = store.capabilities.filter((c) => c.implemented && !c.ready);

  const scan = stepData<MultiScanData>(latestJob, "multi_scan");
  const guard = stepData<ActionGuardData>(latestJob, "action_guard");
  const warnLevel: Level = guard?.level ?? scan?.overall.level ?? "low";
  const warnHeadline = guard?.headline ?? "송금·인증번호·링크·앱 설치 요청이 있었는지 확인하고, 직접 찾은 공식 번호로 먼저 확인하세요.";

  const request = async () => {
    setRequesting(true);
    await store.requestAnalysis(incidentId);
    setRequesting(false);
  };

  return (
    <>
      <TopBar title="분석 결과" onBack={() => back(href.incident(incidentId))} />
      <main className="page">
        <IncidentCard title={incident.title} sub={`자료 ${items.length}개 | ${fmtDate(incident.createdAt)}`} />

        {/* 요청 상태: 대기 · 분석 중 · 실패 · 성공 */}
        {latestJob?.status === "pending" && (
          <div className="status-box running">
            <span className="spinner dark" />
            <div className="grow"><b>분석 요청을 접수했어요</b><p>대기 중입니다. 곧 분석이 시작돼요.</p></div>
          </div>
        )}
        {latestJob?.status === "running" && (
          <div className="status-box running">
            <span className="spinner dark" />
            <div className="grow"><b>AI가 자료를 분석하고 있어요</b><p>등록된 자료 {items.length}개를 확인하고 있어요. 잠시만 기다려 주세요.</p></div>
          </div>
        )}
        {latestJob?.status === "failed" && (
          <div className="status-box failed">
            <Icon name="info" size={26} />
            <div className="grow">
              <b>{latestJob.errorCode === "MODEL_UNAVAILABLE" ? "AI 모델을 사용할 수 없어요" : latestJob.errorCode === NOT_IMPLEMENTED ? "분석 엔진이 아직 준비 중이에요" : "분석을 완료하지 못했어요"}</b>
              <p>
                {latestJob.errorMessage ?? "알 수 없는 오류가 발생했습니다."}
                <br />
                <span className="hint">{fmtDateTime(latestJob.createdAt)} 요청 · 실패한 분석의 결과는 만들어지지 않았어요.</span>
              </p>
            </div>
          </div>
        )}
        {latestJob?.status === "succeeded" && latest && (
          <div className="status-box done">
            <Icon name="check-circle" size={26} />
            <div className="grow">
              <b>{latest.kind === "ai" ? "AI 분석 완료" : "분석 완료"}</b>
              <p>
                {latest.summary.split("\n")[0]}
                <br />
                <span className="hint">
                  {fmtDateTime(latest.createdAt)}
                  {records.length > 1 && <> · 이전 분석 {records.length - 1}건</>}
                </span>
              </p>
            </div>
          </div>
        )}
        {!latestJob && items.length === 0 && (
          <div className="status-box">
            <Icon name="info" size={26} />
            <div className="grow">
              <b>분석할 자료가 없습니다</b>
              <p>먼저 이 사건에 문자·전화·이메일 자료를 등록해 주세요.</p>
              <a className="btn primary sm" href={href.evidenceNew(incidentId)}>+ 자료 등록</a>
            </div>
          </div>
        )}
        {!latestJob && items.length > 0 && (
          <div className="status-box">
            <Icon name="shield-check" size={26} />
            <div className="grow">
              <b>분석을 요청할 수 있어요</b>
              <p>등록된 자료 {items.length}개를 AI 모델과 규칙으로 분석해 위험 징후와 근거 문장을 보여 드려요.</p>
            </div>
          </div>
        )}

        {/* 위험 징후 경고 (앱 화면) — 스캔이 캐릭터도 같은 결과에 따라 문구가 바뀝니다 */}
        {latestJob?.status === "succeeded" && <WarningBanner level={warnLevel} headline={warnHeadline} />}

        {items.length > 0 && (
          <button className="btn primary block lg" style={{ marginTop: 12 }} onClick={request} disabled={requesting || active || notReady.length > 0}>
            {requesting || active ? (
              <><span className="spinner" /> 분석 중…</>
            ) : (
              <><Icon name="shield-check" size={20} /> {latestJob ? "다시 분석 요청" : "분석 요청"}</>
            )}
          </button>
        )}
        {notReady.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <Notice icon="info">{notReady[0].note} (PowerShell: <code>npm run setup:model</code>)</Notice>
          </div>
        )}

        <div className="card list-card" style={{ marginTop: 14 }}>
          {SECTIONS.map((s) => {
            const step = latestJob?.steps.find((st) => st.key === s.api);
            const b = badge(step, caps.get(s.api));
            const showScan = s.api === "multi_scan" && scan && !active;
            const showGuard = s.api === "action_guard" && guard && !active;
            return (
              <section className="sec-row" key={s.api} aria-label={s.name}>
                <div className="row">
                  <span className="sec-ic"><Icon name={s.icon} size={22} /></span>
                  <div className="grow">
                    <b className="sec-name">{s.name}</b>
                    <div className="sec-desc">{s.desc}</div>
                  </div>
                  <span className={`badge-state ${b.cls}`}>{b.text}</span>
                </div>
                {showScan && <MultiScanView data={scan} />}
                {showGuard && <ActionGuardView data={guard} />}
                {step?.status === "failed" && step.errorMessage && <div className="sec-note">{step.errorMessage}</div>}
                {!step && caps.get(s.api) && !caps.get(s.api)!.implemented && <div className="sec-note">{caps.get(s.api)!.note}</div>}
              </section>
            );
          })}
        </div>

        {items.length > 0 && <AiFlowPanel incidentId={incidentId} evidence={items} />}

        {notImplemented.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <Notice>{notImplemented.map((c) => c.title).join(" · ")} 은(는) 다음 단계에서 연결됩니다. 지금은 MULTI SCAN과 ACTION GUARD만 실제로 분석해요.</Notice>
          </div>
        )}
      </main>
      <TabBar active="history" />
    </>
  );
}
