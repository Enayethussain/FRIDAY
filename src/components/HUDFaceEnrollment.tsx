import React, { useEffect, useRef, useState } from 'react';
import { ScanFace, Camera, CheckCircle2, XCircle, Trash2, ShieldCheck } from 'lucide-react';
import { globalFaceAuthManager } from '../services/FaceAuthManager';

interface HUDFaceEnrollmentProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HUDFaceEnrollment({ isOpen, onClose }: HUDFaceEnrollmentProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState('Models load ho rahe hain...');
  const [samples, setSamples] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgOk, setMsgOk] = useState(true);
  const [enrolled, setEnrolled] = useState(globalFaceAuthManager.isEnrolled());
  const [threshold, setThreshold] = useState(globalFaceAuthManager.getThreshold());
  const descriptorsRef = useRef<Float32Array[]>([]);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }
    setMsg('');
    setSamples(0);
    descriptorsRef.current = [];
    setEnrolled(globalFaceAuthManager.isEnrolled());
    (async () => {
      try {
        setStatus('Face models load ho rahe hain (~5MB, pehli baar)...');
        await globalFaceAuthManager.loadModels();
        setStatus('Camera on kar rahe hain...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus('Chehra seedha camera me rakho, roshni chehre pe ho.');
      } catch (e: any) {
        setStatus('');
        setMsg('Camera nahi khul paya: ' + (e?.message || 'permission denied'));
        setMsgOk(false);
      }
    })();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  if (!isOpen) return null;

  const captureSample = async () => {
    if (!videoRef.current || busy) return;
    setBusy(true);
    setMsg('');
    try {
      const d = await globalFaceAuthManager.describeFrame(videoRef.current);
      if (!d) {
        setMsg('Chehra nahi dikha — thoda paas aao, roshni badhao.');
        setMsgOk(false);
      } else {
        descriptorsRef.current.push(d);
        const n = descriptorsRef.current.length;
        setSamples(n);
        if (n >= 3) {
          const res = globalFaceAuthManager.enrollFromDescriptors(descriptorsRef.current);
          setMsg(res.message);
          setMsgOk(res.success);
          if (res.success) {
            setEnrolled(true);
            descriptorsRef.current = [];
            setSamples(0);
          } else {
            descriptorsRef.current = [];
            setSamples(0);
          }
        } else {
          setMsg(`Sample ${n}/3 ho gaya. Halka sa angle badal kar agla lo.`);
          setMsgOk(true);
        }
      }
    } catch (e: any) {
      setMsg('Error: ' + (e?.message || 'capture failed'));
      setMsgOk(false);
    }
    setBusy(false);
  };

  const testVerify = async () => {
    if (!videoRef.current || busy) return;
    setBusy(true);
    setMsg('');
    try {
      const r = await globalFaceAuthManager.verifyFrame(videoRef.current);
      if (!r.faceDetected) {
        setMsg('Chehra nahi dikha.');
        setMsgOk(false);
      } else {
        setMsg(r.verified ? `✅ MATCH (distance ${r.distance.toFixed(3)})` : `❌ NO MATCH (distance ${r.distance.toFixed(3)}, limit ${r.threshold})`);
        setMsgOk(r.verified);
      }
    } catch (e: any) {
      setMsg('Error: ' + (e?.message || 'verify failed'));
      setMsgOk(false);
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-gradient-to-br from-slate-900/95 to-slate-800/95 rounded-2xl border border-violet-500/30 p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ScanFace className="w-6 h-6 text-violet-400" /> Face Verification
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white"><XCircle className="w-5 h-5" /></button>
        </div>

        <p className="text-xs text-slate-400 mb-3">🔒 100% local — chehre ka data kabhi device se bahar nahi jaata. {enrolled ? 'Status: ENROLLED ✅' : 'Status: NOT ENROLLED'}</p>

        <div className="rounded-xl overflow-hidden border border-slate-700 bg-black aspect-[4/3] flex items-center justify-center">
          <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
        </div>
        {status && <p className="text-xs text-cyan-300 font-mono mt-2">{status}</p>}

        <div className="flex gap-2 mt-3">
          <button
            onClick={captureSample}
            disabled={busy}
            className="flex-1 py-2.5 bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white font-semibold rounded-xl flex items-center justify-center gap-2"
          >
            <Camera className="w-4 h-4" /> Sample Lo ({samples}/3)
          </button>
          {enrolled && (
            <button
              onClick={testVerify}
              disabled={busy}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" /> Test Karo
            </button>
          )}
        </div>

        {msg && (
          <div className={`mt-3 p-3 rounded-xl text-sm flex items-start gap-2 ${msgOk ? 'bg-green-500/10 border border-green-500/30 text-green-200' : 'bg-red-500/10 border border-red-500/30 text-red-200'}`}>
            {msgOk ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <XCircle className="w-5 h-5 shrink-0" />}
            <span>{msg}</span>
          </div>
        )}

        {enrolled && (
          <div className="mt-4 pt-3 border-t border-slate-700">
            <label className="text-xs text-slate-400 font-mono">Sensitivity (kam = strict): {threshold.toFixed(2)}</label>
            <input
              type="range" min={0.3} max={0.8} step={0.05} value={threshold}
              onChange={(e) => { const v = parseFloat(e.target.value); setThreshold(v); globalFaceAuthManager.setThreshold(v); }}
              className="w-full mt-1"
            />
            <button
              onClick={() => { globalFaceAuthManager.clearProfile(); setEnrolled(false); setMsg('Face profile delete ho gaya.'); setMsgOk(true); }}
              className="mt-2 w-full py-2 text-red-400 hover:text-red-300 text-sm flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" /> Face Profile Delete Karo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
