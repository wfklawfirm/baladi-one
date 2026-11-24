"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2, Mic as MicIcon, Square } from "lucide-react";

const MAX_SECONDS = 60;
type Props = {
  /** id of the input or textarea the transcript goes into */
  target: string;
  /** "append" adds to what is already typed; "replace" is for search boxes */
  mode?: "append" | "replace";
  /** submit the field's form once the text is in (search boxes) */
  submit?: boolean;
  /** "lg" for the touchscreen kiosk */
  size?: "md" | "lg";
  className?: string;
};

/** Writes into a field so that React-controlled and plain form fields both see the change. */
function write(id: string, text: string, mode: "append" | "replace", submit: boolean) {
  const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el) return;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const current = el.value.trim();
  let next = mode === "replace" || !current ? text : `${current} ${text}`;
  if (mode === "replace") next = next.replace(/[.،؛!؟?]+$/u, "");
  if (el.maxLength > 0) next = next.slice(0, el.maxLength);
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, next);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.focus();
  if (submit) el.form?.requestSubmit();
}

/** Dictation button: records up to a minute, has it transcribed by /api/voice, and puts the text in the target field. */
export default function Mic({ target, mode = "append", submit = false, size = "md", className = "" }: Props) {
  const [state, setState] = useState<"idle" | "rec" | "busy">("idle");
  const [secs, setSecs] = useState(0);
  const [msg, setMsg] = useState("");
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);

  const release = () => {
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(() => () => { release(); if (hide.current) clearTimeout(hide.current); if (rec.current?.state === "recording") rec.current.stop(); }, []);

  const say = (m: string) => {
    setMsg(m);
    if (hide.current) clearTimeout(hide.current);
    hide.current = setTimeout(() => setMsg(""), 5000);
  };

  async function send(blob: Blob) {
    setState("busy");
    try {
      const body = new FormData();
      body.append("audio", new File([blob], "voice", { type: blob.type || "audio/webm" }));
      const r = await fetch("/api/voice", { method: "POST", body });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) say(j.error ?? "تعذّر تحويل الصوت إلى نص، حاول مجدداً");
      else if (!j.text) say("لم أسمع كلاماً واضحاً، حاول مجدداً");
      else write(target, j.text, mode, submit);
    } catch { say("تعذّر الاتصال، حاول مجدداً"); }
    setState("idle");
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return say("هذا المتصفح لا يدعم التسجيل الصوتي");
    try { stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { return say("اسمح باستخدام الميكروفون ثم حاول مجدداً"); }
    const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported?.(t));
    let mr: MediaRecorder;
    try { mr = new MediaRecorder(stream.current, type ? { mimeType: type, audioBitsPerSecond: 48_000 } : undefined); }
    catch { release(); return say("تعذّر بدء التسجيل"); }
    chunks.current = [];
    mr.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    mr.onstop = () => {
      release();
      const blob = new Blob(chunks.current, { type: mr.mimeType || type || "audio/webm" });
      if (blob.size < 800) { setState("idle"); return say("التسجيل قصير جداً، حاول مجدداً"); }
      void send(blob);
    };
    rec.current = mr; mr.start(); setSecs(0); setMsg(""); setState("rec");
    let n = 0;
    tick.current = setInterval(() => { n += 1; setSecs(n); if (n >= MAX_SECONDS && mr.state === "recording") mr.stop(); }, 1000);
  }

  const onClick = () => {
    if (state === "idle") void start();
    else if (state === "rec" && rec.current?.state === "recording") rec.current.stop();
  };
  const big = size === "lg";
  const label = state === "rec" ? "إيقاف التسجيل وتحويله إلى نص" : state === "busy" ? "جاري تحويل الصوت إلى نص" : "إملاء بالصوت";

  return (
    <span className={`${/\b(absolute|fixed|sticky)\b/.test(className) ? "" : "relative"} inline-flex shrink-0 ${className}`}>
      <button type="button" onClick={onClick} disabled={state === "busy"} aria-label={label} title={label} aria-pressed={state === "rec"}
        className={`grid place-items-center border transition active:scale-95 ${big ? "size-[4.5rem] rounded-2xl" : "size-12 rounded-xl"} ${state === "rec" ? "border-destructive bg-destructive text-white" : "bg-background text-primary hover:bg-muted"}`}>
        {state === "busy" ? <Loader2 className={`${big ? "size-8" : "size-5"} animate-spin`} /> : state === "rec" ? <Square className={`${big ? "size-6" : "size-4"} animate-pulse fill-current`} /> : <MicIcon className={big ? "size-8" : "size-5"} />}
      </button>
      {state === "rec" && <span aria-hidden className="pointer-events-none absolute -top-2 start-1/2 -translate-x-1/2 rounded-full bg-foreground px-1.5 text-[11px] font-semibold tabular-nums text-background rtl:translate-x-1/2">0:{String(secs).padStart(2, "0")}</span>}
      {msg && <span role="alert" className="absolute end-0 top-full z-30 mt-1 w-max max-w-[15rem] rounded-lg bg-foreground px-3 py-1.5 text-xs leading-5 text-background shadow-lg">{msg}</span>}
    </span>
  );
}
