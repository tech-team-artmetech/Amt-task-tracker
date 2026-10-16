import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Upload,
  X,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Video,
  RefreshCw,
  HelpCircle,
  LogIn,
  Edit2,
  Calendar,
} from 'lucide-react';
import { api } from '../api';
import { User } from '../types';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDate?: string;
  availableDates?: Array<{ date: string; label: string }>;
  onExtractionSuccess: (
    employees: Array<{
      name: string;
      originalExtractedName?: string;
      matchedName?: string;
      tasks: string[];
    }>,
    imagePreview: string,
    targetDate: string,
    autoMatchedCount?: number
  ) => void;
  onSessionExpired?: () => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  defaultDate,
  availableDates = [],
  onExtractionSuccess,
  onSessionExpired,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [targetDate, setTargetDate] = useState<string>(defaultDate || todayStr);
  const [activeTab, setActiveTab] = useState<'upload' | 'camera'>('upload');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');

  // Sync defaultDate if provided
  useEffect(() => {
    if (defaultDate && /^\d{4}-\d{2}-\d{2}$/.test(defaultDate)) {
      setTargetDate(defaultDate);
    }
  }, [defaultDate]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAuthError, setIsAuthError] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsProcessing(false);
    stopCamera();
    onClose();
  };

  // Camera video ref
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Stop camera when closing or switching tabs
  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  useEffect(() => {
    if (!isOpen || activeTab !== 'camera') {
      stopCamera();
    }
  }, [isOpen, activeTab]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setIsCameraActive(true);
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError('Camera access was denied or not available. Please upload a photo instead.');
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 1280;
    canvas.height = videoRef.current.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setSelectedImage(dataUrl);
      setMimeType('image/jpeg');
      stopCamera();
    }
  };

  const processAndSetFile = (file: File) => {
    setErrorMessage(null);
    setMimeType(file.type || 'image/jpeg');

    const reader = new FileReader();
    reader.onload = (event) => {
      setSelectedImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processAndSetFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    processAndSetFile(file);
  };

  const handleProcessImage = async (overrideImage?: string) => {
    const imageToUse = overrideImage || selectedImage;
    if (!imageToUse) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsProcessing(true);
    setErrorMessage(null);
    setIsAuthError(false);

    try {
      const res = await api.extractBoard(imageToUse, mimeType, abortControllerRef.current.signal);
      if (!res || !Array.isArray(res.employees) || res.employees.length === 0) {
        throw new Error("Couldn't read any team columns or tasks from this photo. Please try a clearer, well-lit photo.");
      }
      onExtractionSuccess(res.employees, imageToUse, targetDate, res.autoMatchedCount);
      onClose();
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        return;
      }
      console.error('Extraction error:', err);
      const msg = err.message || "Couldn't read the board, try a clearer photo";
      const isAuth =
        msg.toLowerCase().includes('session') ||
        msg.toLowerCase().includes('log in') ||
        msg.toLowerCase().includes('expired') ||
        msg.toLowerCase().includes('authentication') ||
        msg.toLowerCase().includes('unauthorized') ||
        msg.toLowerCase().includes('forbidden');

      setIsAuthError(isAuth);
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // The session has expired: send the admin back to the normal login screen.
  const handleReAuthenticate = () => {
    setErrorMessage(null);
    setIsAuthError(false);
    onClose();
    onSessionExpired?.();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-8 sm:w-9 h-8 sm:h-9 rounded-xl bg-[#2E2BE6] text-white flex items-center justify-center shadow-xs shrink-0">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black font-display text-slate-900 leading-tight uppercase tracking-tight">
                Upload Tasklist Photo
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500">
                Gemini Vision extracts team columns — the top task becomes P1 automatically
              </p>
            </div>
          </div>
          <button
            onClick={() => handleCancel()}
            className="p-1.5 sm:p-2 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto border-b border-slate-100 px-4 sm:px-6 pt-2.5 sm:pt-3 gap-1 sm:gap-2 scrollbar-none">
          <button
            id="tab-upload-file"
            onClick={() => {
              setActiveTab('upload');
              stopCamera();
            }}
            className={`pb-2.5 px-3.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'upload'
                ? 'border-[#2E2BE6] text-[#2E2BE6]'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload File</span>
          </button>

          <button
            id="tab-camera"
            onClick={() => {
              setActiveTab('camera');
              startCamera();
            }}
            className={`pb-2.5 px-3.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'camera'
                ? 'border-[#2E2BE6] text-[#2E2BE6]'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>Take Photo</span>
          </button>

        </div>

        {/* Content Area */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 flex flex-col gap-4">
          {/* Target Date Selector */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#2E2BE6]/10 text-[#2E2BE6] flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <label htmlFor="upload-tasklist-date" className="block text-xs font-bold text-slate-800 leading-tight">
                  What date is this tasklist for?
                </label>
                <p className="text-[11px] text-slate-500">
                  Select the day this tasklist applies to so it does not default to today.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <input
                id="upload-tasklist-date"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2E2BE6] focus:border-transparent cursor-pointer shadow-2xs"
              />
              {targetDate === todayStr ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                  Today
                </span>
              ) : targetDate < todayStr ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                  Past Day
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Future Day
                </span>
              )}
            </div>
          </div>

          {/* TAB 1: File Upload */}
          {activeTab === 'upload' && (
            <div>
              {!selectedImage ? (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-slate-50/50 hover:bg-indigo-50/20"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
                    <Upload className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-slate-800 mb-1">
                    Click to browse or drag & drop a tasklist photo
                  </p>
                  <p className="text-xs text-slate-500 max-w-sm">
                    Supports high-resolution JPG, PNG, WEBP. Ensure names at the top of each column are visible.
                  </p>
                </div>
              ) : (
                <div className="relative rounded-xl border border-slate-200 overflow-hidden bg-slate-900">
                  <img
                    src={selectedImage}
                    alt="Tasklist Preview"
                    className="w-full max-h-72 object-contain"
                  />
                  <button
                    onClick={() => setSelectedImage(null)}
                    className="absolute top-2 right-2 px-2.5 py-1 bg-slate-900/80 hover:bg-slate-900 text-white rounded-md text-xs font-medium backdrop-blur-xs transition-colors flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Choose Different Photo</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Live Camera Capture */}
          {activeTab === 'camera' && (
            <div>
              {cameraError ? (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs">
                  <p className="font-semibold mb-1">Camera Notice</p>
                  <p>{cameraError}</p>
                </div>
              ) : selectedImage ? (
                <div className="relative rounded-xl border border-slate-200 overflow-hidden bg-slate-900">
                  <img
                    src={selectedImage}
                    alt="Captured Tasklist"
                    className="w-full max-h-72 object-contain"
                  />
                  <button
                    onClick={() => {
                      setSelectedImage(null);
                      startCamera();
                    }}
                    className="absolute top-2 right-2 px-2.5 py-1 bg-slate-900/80 hover:bg-slate-900 text-white rounded-md text-xs font-medium backdrop-blur-xs transition-colors flex items-center gap-1"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retake Photo</span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-full max-h-72 rounded-xl overflow-hidden bg-slate-900 flex items-center justify-center relative">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      className="w-full h-full max-h-72 object-contain"
                    />
                    {!isCameraActive && (
                      <p className="absolute text-xs text-slate-400">Starting camera preview...</p>
                    )}
                  </div>

                  {isCameraActive && (
                    <button
                      id="btn-take-snapshot"
                      onClick={capturePhoto}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Snap Tasklist Photo</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex flex-col gap-2.5 animate-fadeIn">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-rose-900">{errorMessage}</p>
                  {!isAuthError ? (
                    <p className="text-rose-700 mt-0.5 text-[11px]">
                      Ensure the image is in focus, column headings are clear, and tasks are handwritten underneath.
                    </p>
                  ) : (
                    <p className="text-rose-700 mt-0.5 text-[11px]">
                      Your admin session needs to be refreshed before sending this image to Gemini Vision.
                    </p>
                  )}
                </div>
              </div>

              {!isAuthError && selectedImage && (
                <div className="pl-6.5 pt-0.5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleProcessImage()}
                    disabled={isProcessing}
                    className="px-3.5 py-1.5 bg-[#2E2BE6] hover:bg-[#221fd4] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                    <span>{isProcessing ? 'Retrying...' : 'Retry Vision Extraction'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onExtractionSuccess(
                        [
                          { name: 'Team Member 1', tasks: ['Task 1'] },
                          { name: 'Team Member 2', tasks: ['Task 1'] },
                        ],
                        selectedImage,
                        targetDate
                      );
                      onClose();
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Open Review Screen with this Photo</span>
                  </button>
                </div>
              )}

              {isAuthError && (
                <div className="pl-6.5 pt-0.5">
                  <button
                    type="button"
                    onClick={handleReAuthenticate}
                    disabled={isProcessing}
                    className="px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Sign in again</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Gemini Vision Instruction Card */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600 flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-800">Next Step: Editable Review Screen. </span>
              Handwriting OCR is never perfect. You will review and refine all extracted names and tasks
              before confirming publication.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
          <button
            onClick={() => handleCancel()}
            className="px-3 sm:px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            id="btn-process-vision"
            onClick={() => handleProcessImage()}
            disabled={!selectedImage || isProcessing}
            className={`px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs font-bold shadow-xs flex items-center gap-1.5 sm:gap-2 transition-all ${
              !selectedImage || isProcessing
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-[#2E2BE6] hover:bg-[#221fd4] text-white'
            }`}
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span className="truncate">Reading Tasklist with Gemini...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Process with Gemini Vision</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
