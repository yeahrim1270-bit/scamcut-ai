"""모델 파일 내려받기: python -m app.ml.download

HuggingFace 에서 ONNX 모델과 토크나이저를 받고, 저장소가 제공하는 SHA-256 으로 무결성을 검증합니다.
이미 받은 파일은 검증만 하고 건너뜁니다.
"""
import hashlib
import json
import sys
import urllib.request

from .model_spec import FILES, MODEL_DIR, MODEL_ID

HF = "https://huggingface.co"


def _get_json(url: str):
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)


def _sha256(path, chunk=1 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while block := f.read(chunk):
            h.update(block)
    return h.hexdigest()


def main() -> int:
    try:  # Windows 콘솔(cp949)에서도 한글 출력이 깨지거나 멈추지 않도록
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    info = _get_json(f"{HF}/api/models/{MODEL_ID}")
    revision = info["sha"]
    print(f"모델: {MODEL_ID}  (revision {revision[:10]})")
    tree = {t["path"]: t for t in _get_json(f"{HF}/api/models/{MODEL_ID}/tree/{revision}") if t["type"] == "file"}
    tree.update({t["path"]: t for t in _get_json(f"{HF}/api/models/{MODEL_ID}/tree/{revision}/onnx") if t["type"] == "file"})

    for local, remote in FILES.items():
        meta = tree[remote]
        expected = (meta.get("lfs") or {}).get("oid")  # LFS 파일은 SHA-256, 일반 파일은 git blob 해시라 크기로 확인
        size = (meta.get("lfs") or {}).get("size") or meta["size"]
        dest = MODEL_DIR / local
        if dest.exists() and dest.stat().st_size == size and (not expected or _sha256(dest) == expected):
            print(f"  - {local}: 이미 있음 (검증 완료)")
            continue
        url = f"{HF}/{MODEL_ID}/resolve/{revision}/{remote}"
        print(f"  - {local}: 내려받는 중 ({size / 1e6:.0f} MB)")
        tmp = dest.with_suffix(dest.suffix + ".part")
        done = 0
        next_mark = 10
        with urllib.request.urlopen(url, timeout=60) as r, open(tmp, "wb") as f:
            while block := r.read(1 << 20):
                f.write(block)
                done += len(block)
                print(f"\r    {done / size * 100:5.1f}%", end="", flush=True)
        print()
        if expected and _sha256(tmp) != expected:
            tmp.unlink(missing_ok=True)
            print(f"    [실패] {local}: 해시가 일치하지 않아 삭제했습니다. 다시 실행해 주세요.", file=sys.stderr)
            return 1
        tmp.replace(dest)
        print(f"    [OK] {local}: 검증 완료")
    (MODEL_DIR / "REVISION").write_text(f"{MODEL_ID}@{revision}\n", encoding="utf-8")
    print(f"완료: {MODEL_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
