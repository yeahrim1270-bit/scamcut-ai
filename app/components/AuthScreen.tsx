"use client";

import { useEffect, useState } from "react";
import { href } from "@/lib/route";
import type { Store } from "@/lib/store";
import { TabBar, TopBar } from "./common";
import { ScaniAvatar } from "./Scani";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// 로그인 / 회원가입 화면
export default function AuthScreen({ mode, store, go, back }: { mode: "login" | "signup"; store: Store; go: (to: string) => void; back: (fallback: string) => void }) {
  const signup = mode === "signup";
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});

  // 이미 로그인되어 있으면 내 정보로 이동
  useEffect(() => {
    if (store.user) go(href.me);
  }, [store.user, go]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!EMAIL.test(email.trim())) e.email = "이메일 형식이 올바르지 않아요.";
    if (signup) {
      if (!name.trim()) e.name = "이름을 입력해 주세요.";
      if (password.length < 8) e.password = "비밀번호는 8자 이상이어야 해요.";
      else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) e.password = "영문과 숫자를 모두 포함해 주세요.";
      if (confirm !== password) e.confirm = "비밀번호가 서로 달라요.";
    } else if (!password) e.password = "비밀번호를 입력해 주세요.";
    return e;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    setError(null);
    const e = validate();
    setFieldErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const r = signup ? await store.signup(email.trim(), name.trim(), password) : await store.login(email.trim(), password);
    setBusy(false);
    if (r.ok) {
      store.notify("info", signup ? "가입이 완료되어 로그인되었어요." : "로그인되었어요.");
      go(href.me);
      return;
    }
    setError(r.error);
    if (r.fields.length) setFieldErr(Object.fromEntries(r.fields.map((f) => [f.field, f.message.replace(/^[^:]+:\s*/, "")])));
  };

  return (
    <>
      <TopBar title={signup ? "회원가입" : "로그인"} onBack={() => back(href.me)} />
      <main className="page">
        <div className="auth-head">
          <div className="auth-hero"><ScaniAvatar size={150} alt="스캔이 캐릭터" /></div>
          {signup && <h2 className="auth-title">스캔이와 함께 시작해요</h2>}
          <p className="muted small" style={{ margin: signup ? "4px 0 18px" : "0 0 18px" }}>
            {signup ? "이메일과 비밀번호로 계정을 만들어요." : "가입한 이메일과 비밀번호를 입력해 주세요."}
          </p>
        </div>

        <form onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="email">이메일</label>
            <input id="email" type="email" inputMode="email" autoComplete="email" placeholder="example@email.com" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />
            {fieldErr.email && <span className="err">{fieldErr.email}</span>}
          </div>

          {signup && (
            <div className="field">
              <label htmlFor="name">이름</label>
              <input id="name" autoComplete="nickname" placeholder="표시될 이름 (20자 이내)" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
              {fieldErr.name && <span className="err">{fieldErr.name}</span>}
            </div>
          )}

          <div className="field">
            <label htmlFor="password">비밀번호</label>
            <div className="pw-wrap">
              <input
                id="password"
                type={show ? "text" : "password"}
                autoComplete={signup ? "new-password" : "current-password"}
                placeholder={signup ? "8자 이상, 영문+숫자" : "비밀번호"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={100}
              />
              <button type="button" className="pw-toggle" onClick={() => setShow((s) => !s)} aria-label={show ? "비밀번호 숨기기" : "비밀번호 보기"}>
                {show ? "숨기기" : "보기"}
              </button>
            </div>
            {fieldErr.password && <span className="err">{fieldErr.password}</span>}
          </div>

          {signup && (
            <div className="field">
              <label htmlFor="confirm">비밀번호 확인</label>
              <input id="confirm" type={show ? "text" : "password"} autoComplete="new-password" placeholder="비밀번호를 한 번 더 입력" value={confirm} onChange={(e) => setConfirm(e.target.value)} maxLength={100} />
              {fieldErr.confirm && <span className="err">{fieldErr.confirm}</span>}
            </div>
          )}

          {error && <div className="auth-error" role="alert">{error}</div>}

          <button className="btn primary block lg" type="submit" disabled={busy}>
            {busy ? <><span className="spinner" /> {signup ? "가입 중…" : "로그인 중…"}</> : signup ? "회원가입" : "로그인"}
          </button>
        </form>

        <p className="auth-switch">
          {signup ? "이미 계정이 있나요? " : "아직 계정이 없나요? "}
          <a href={signup ? href.login : href.signup}>{signup ? "로그인" : "회원가입"}</a>
        </p>

        {signup && (
          <div className="notice" style={{ marginTop: 14 }}>
            <span>비밀번호는 암호화(해시)되어 저장되고 원문은 보관하지 않아요. 시연용 서비스이니 실제로 쓰는 비밀번호는 사용하지 마세요.</span>
          </div>
        )}
      </main>
      <TabBar active="me" />
    </>
  );
}
