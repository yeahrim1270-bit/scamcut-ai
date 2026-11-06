"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { stepData, type ActionGuardData, type Level, type MultiScanData } from "@/lib/analysis";
import { isActiveJob, type AnalysisStep, type AnalyzerInfo, type AnalyzerKey } from "@/lib/models";
import { href } from "@/lib/route";
import type { Store } from "@/lib/store";
import AiFlowPanel from "./AiFlowPanel";
import AnalyzingView from "./AnalyzingView";
import { ActionGuardView, MultiScanView, ResultHero, RiskSummary } from "./AnalysisViews";
import { Empty, IncidentCard, Notice, TabBar, TopBar, fmtDate, fmtDateTime } from "./common";
import { Icon, type IconName } from "./icons";

const SECTIONS: { api: AnalyzerKey; name: string; icon: IconName; desc: string }[] = [
  { api: "multi_scan", name: "MULTI SCAN", icon: "search", desc: "사칭 대상·주제·URL·긴급성·요청 행동" },
  { api: "action_guard", name: "ACTION GUARD", icon: "shield-check", desc: "위험 행동 탐지와 안전한 대응" },
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
  autorun = false,
  store,
  go,
  back,
}: {
  incidentId: string;
  autorun?: boolean; // 타임라인의 'AI 분석하기'로 들어오면 true: 열리자마자 분석을 시작
  store: Store;
  go: (to: string) => void;
  back: (fallback: string) => void;
}) {
  // autorun 이면 처음부터 '분석 중' 화면으로 시작해 일반 화면이 잠깐 비치지 않게 합니다.
  const [requesting, setRequesting] = useState(autorun);

  const runAnalysis = useCallback(async () => {
    setRequesting(true);
    const t0 = Date.now();
    await store.requestAnalysis(incidentId);
    // 분석이 순식간에 끝나도 '분석 중' 화면이 깜빡이듯 사라지지 않도록 최소 2.8초 유지(진행 표시는 실제 단계 상태)
    const rest = 2800 - (Date.now() - t0);
    if (rest > 0) await new Promise((r) => setTimeout(r, rest));
    setRequesting(false);
  }, [store, incidentId]);

  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autorun || autoStarted.current) return;
    autoStarted.current = true;
    window.history.replaceState(null, "", href.analysis(incidentId)); // 새로고침해도 다시 분석하지 않도록 ?run=1 제거
    const hasItems = store.db.evidence.some((e) => e.incidentId === incidentId);
    const busy = store.db.jobs.some((j) => j.incidentId === incidentId && isActiveJob(j));
    if (!hasItems || busy) {
      setRequesting(false); // 분석할 자료가 없거나 이미 진행 중이면 새로 시작하지 않음
      return;
    }
    void runAnalysis();
  }, [autorun, incidentId, store, runAnalysis]);
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
  // 발견된 위험 행동은 바로 아래 요약 카드에 나오므로, 경고 상자에는 짧은 행동 지침만 둡니다(중복 방지).
  const warnHeadline = guard && guard.actions.length > 0
    ? "요구받은 행동을 지금은 따르지 말고, 직접 찾은 공식 번호로 먼저 확인하세요."
    : "송금·인증번호·링크·앱 설치 요청이 있었는지 확인하고, 직접 찾은 공식 번호로 먼저 확인하세요.";

  const request = runAnalysis;

  // 분석 요청 직후~분석 진행 중에는 'AI 분석 중' 화면을 보여 줍니다.
  if (requesting || active) {
    return (
      <>
        <TopBar title="AI 분석 중" onBack={() => back(href.incident(incidentId))} />
        <main className="page">
          <AnalyzingView job={latestJob} caps={caps} />
        </main>
        <TabBar active="history" />
      </>
    );
  }

  const succeeded = latestJob?.status === "succeeded" && !!(scan || guard);
  const rows = SECTIONS.filter((s) => s.api === "multi_scan" || s.api === "action_guard");

  return (
    <>
      <TopBar title="분석 결과" onBack={() => back(href.incident(incidentId))} />
      <main className="page">
        <IncidentCard title={incident.title} sub={`자료 ${items.length}개 | ${fmtDate(incident.createdAt)}`} />

        {/* 분석 전 · 실패 상태 */}
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
              <p>등록된 자료 {items.length}개를 AI 모델과 규칙으로 분석해요.</p>
            </div>
          </div>
        )}
        {items.length > 0 && !succeeded && (
          <button className="btn primary block lg" style={{ marginTop: 12 }} onClick={request} disabled={requesting || active || notReady.length > 0}>
            <Icon name="shield-check" size={20} /> {latestJob ? "다시 분석 요청" : "분석 요청"}
          </button>
        )}
        {notReady.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <Notice icon="info">{notReady[0].note} (PowerShell: <code>npm run setup:model</code>)</Notice>
          </div>
        )}

        {/* 분석 결과: 위에는 핵심만, 자세한 내용은 눌러서 펼치기 */}
        {succeeded && (
          <>
            <ResultHero level={warnLevel} headline={warnHeadline} />
            {guard && <RiskSummary guard={guard} />}
            {latest && (
              <div className="meta-line">
                AI 분석 완료 · {fmtDateTime(latest.createdAt)} · 자료 {items.length}개{records.length > 1 ? ` · 이전 분석 ${records.length - 1}건` : ""}
              </div>
            )}
            <div className="acc-list">
              {rows.map((s) => {
                const step = latestJob?.steps.find((st) => st.key === s.api);
                const b = badge(step, caps.get(s.api));
                return (
                  <details className="card acc" key={s.api}>
                    <summary className="acc-sum">
                      <span className="sec-ic"><Icon name={s.icon} size={22} /></span>
                      <span className="grow">
                        <b className="sec-name">{s.name}</b>
                        <small>{s.desc}</small>
                      </span>
                      <span className={`badge-state ${b.cls}`}>{b.text}</span>
                      <span className="acc-chev"><Icon name="chevron-right" size={18} /></span>
                    </summary>
                    <div className="acc-body">
                      {s.api === "multi_scan" && scan && <MultiScanView data={scan} />}
                      {s.api === "action_guard" && guard && <ActionGuardView data={guard} />}
                      {step?.status === "failed" && step.errorMessage && <div className="sec-note" style={{ marginLeft: 0 }}>{step.errorMessage}</div>}
                    </div>
                  </details>
                );
              })}
            </div>
          </>
        )}

        {items.length > 0 && <AiFlowPanel incidentId={incidentId} evidence={items} />}

        {notImplemented.length > 0 && (
          <p className="foot-note">{notImplemented.map((c) => c.title).join(" · ")} 은(는) 다음 단계에서 연결돼요.</p>
        )}

        {succeeded && items.length > 0 && (
          <button className="btn outline block" style={{ marginTop: 6 }} onClick={request} disabled={requesting || active || notReady.length > 0}>
            다시 분석하기
          </button>
        )}
      </main>
      <TabBar active="history" />
    </>
  );
}
