import React, { useState, useEffect } from 'react';
import { ShieldCheck, Mic, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

interface HUDVoiceEnrollmentProps {
  isOpen: boolean;
  onClose: () => void;
  onEnrollmentComplete: () => void;
  stateManager: any;
}

export function HUDVoiceEnrollment({ isOpen, onClose, onEnrollmentComplete, stateManager }: HUDVoiceEnrollmentProps) {
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentSample, setCurrentSample] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [enrollmentStatus, setEnrollmentStatus] = useState<'idle' | 'recording' | 'processing' | 'complete' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const requiredSamples = 5;
  const phrases = [
    "Hello FRIDAY, this is my voice",
    "My name is Commander Enayet Hussain",
    "I am the only authorized user",
    "FRIDAY, activate voice authentication",
    "Grant me Level 5 clearance access"
  ];

  useEffect(() => {
    if (!isOpen) {
      setIsEnrolling(false);
      setProgress(0);
      setCurrentSample(0);
      setEnrollmentStatus('idle');
      setIsRecording(false);
    }
  }, [isOpen]);

  const startEnrollment = async () => {
    try {
      setIsEnrolling(true);
      setEnrollmentStatus('idle');
      setCurrentSample(0);
      setProgress(0);
      setErrorMsg('');

      const voiceAuth = stateManager.getVoiceAuthManager();
      voiceAuth.resetEnrollment();

      recordNextSample();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to start enrollment');
      setEnrollmentStatus('error');
    }
  };

  const recordNextSample = async () => {
    setEnrollmentStatus('recording');
    setIsRecording(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        }
      });

      const audioContext = new AudioContext({ sampleRate: 48000 });
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      const audioChunks: Float32Array[] = [];
      let recordingStartTime = Date.now();
      const recordingDuration = 3000; // 3 seconds per sample

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const chunk = new Float32Array(inputData);
        audioChunks.push(chunk);

        if (Date.now() - recordingStartTime >= recordingDuration) {
          processor.disconnect();
          source.disconnect();
          stream.getTracks().forEach(track => track.stop());
          audioContext.close();
          setIsRecording(false);
          processRecordedSample(audioChunks, 48000);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

    } catch (err: any) {
      setErrorMsg('Microphone access denied');
      setEnrollmentStatus('error');
      setIsRecording(false);
    }
  };

  const processRecordedSample = (chunks: Float32Array[], sampleRate: number) => {
    setEnrollmentStatus('processing');

    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    // Quality gate: khamoshi/halki recording sample NAHI banegi
    let energy = 0;
    for (let i = 0; i < combined.length; i++) energy += combined[i] * combined[i];
    energy = Math.sqrt(energy / combined.length);
    if (energy < 0.02) {
      setErrorMsg(`Awaaz bahut halki thi (level ${energy.toFixed(3)}). Mic paas rakho aur ZOR SE bolo — ye sample count nahi hua.`);
      setEnrollmentStatus('error');
      setTimeout(() => {
        setErrorMsg('');
        setEnrollmentStatus('idle');
        recordNextSample();
      }, 2500);
      return;
    }

    const voiceAuth = stateManager.getVoiceAuthManager();
    const result = voiceAuth.enrollVoiceSample(combined, sampleRate);

    setProgress(result.progress);
    setCurrentSample(currentSample + 1);

    if (result.complete) {
      setEnrollmentStatus('complete');
      setTimeout(() => {
        onEnrollmentComplete();
        onClose();
      }, 2000);
    } else {
      setTimeout(() => {
        recordNextSample();
      }, 1000);
    }
  };

  const clearEnrollment = () => {
    const voiceAuth = stateManager.getVoiceAuthManager();
    voiceAuth.clearProfile();
    setIsEnrolling(false);
    setProgress(0);
    setCurrentSample(0);
    setEnrollmentStatus('idle');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl mx-4 bg-gradient-to-br from-slate-900/95 to-slate-800/95 rounded-2xl border border-amber-500/30 shadow-2xl shadow-amber-500/20 p-8">
        
        <button
          onClick={onClose}
          disabled={isRecording}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <XCircle className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <ShieldCheck className="w-8 h-8 text-amber-400" />
          <div>
            <h2 className="text-2xl font-bold text-white">Voice Authentication Setup</h2>
            <p className="text-sm text-slate-400">Enroll your voice biometric signature</p>
          </div>
        </div>

        {!isEnrolling && enrollmentStatus === 'idle' && (
          <div className="space-y-6">
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-amber-400 mb-3">How it works:</h3>
              <ul className="space-y-2 text-slate-300 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 font-bold">1.</span>
                  <span>You'll record <strong>5 voice samples</strong> (3 seconds each)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 font-bold">2.</span>
                  <span>FRIDAY analyzes your voice pitch, tone, and frequency patterns</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 font-bold">3.</span>
                  <span>Your voice profile is stored locally (encrypted)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 font-bold">4.</span>
                  <span>Only your voice will be authorized to control FRIDAY</span>
                </li>
              </ul>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-200">
                <strong>Important:</strong> Speak clearly in a quiet environment. Background noise (AC, fan) will be filtered out.
              </div>
            </div>

            <button
              onClick={startEnrollment}
              className="w-full py-4 bg-gradient-to-r from-amber-500 to-amber-500 hover:from-amber-400 hover:to-amber-400 text-white font-semibold rounded-xl transition flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-5 h-5" />
              Start Voice Enrollment
            </button>
          </div>
        )}

        {isEnrolling && (
          <div className="space-y-6">
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-amber-500/20 border-4 border-amber-500/50 mb-4">
                <Mic className={`w-12 h-12 text-amber-400 ${isRecording ? 'animate-pulse' : ''}`} />
              </div>

              <div>
                <h3 className="text-xl font-bold text-white mb-2">
                  {enrollmentStatus === 'recording' && `Recording Sample ${currentSample + 1}/${requiredSamples}`}
                  {enrollmentStatus === 'processing' && 'Processing Voice Data...'}
                  {enrollmentStatus === 'complete' && 'Enrollment Complete!'}
                </h3>
                
                {enrollmentStatus === 'recording' && (
                  <p className="text-amber-400 text-lg font-semibold mb-4">
                    "{phrases[currentSample]}"
                  </p>
                )}
              </div>

              <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-amber-500 to-amber-500 transition-all duration-500"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>

              <p className="text-slate-400 text-sm">
                {Math.round(progress * 100)}% Complete
              </p>
            </div>

            {enrollmentStatus === 'complete' && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-400" />
                <div className="text-green-200">
                  <strong>Success!</strong> Your voice has been enrolled. FRIDAY will now only respond to your voice.
                </div>
              </div>
            )}
          </div>
        )}

        {enrollmentStatus === 'error' && (
          <div className="space-y-4">
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
              <XCircle className="w-6 h-6 text-red-400 flex-shrink-0" />
              <div className="text-red-200">
                <strong>Error:</strong> {errorMsg || 'Voice enrollment failed. Please try again.'}
              </div>
            </div>
            <button
              onClick={startEnrollment}
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-white font-semibold rounded-xl transition"
            >
              Try Again
            </button>
          </div>
        )}

        {!isEnrolling && enrollmentStatus === 'idle' && (
          <div className="mt-4 pt-4 border-t border-slate-700">
            <button
              onClick={clearEnrollment}
              className="w-full py-2 text-red-400 hover:text-red-300 text-sm font-medium transition"
            >
              Clear Existing Voice Profile
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
