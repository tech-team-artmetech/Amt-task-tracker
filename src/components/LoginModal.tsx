import React, { useState } from 'react';
import { LogIn, Lock, Mail, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { api } from '../api';
import { User } from '../types';

interface LoginModalProps {
  onLoginSuccess: (user: User) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Incorrect login Id or password');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await api.login(email.trim(), password);
      onLoginSuccess(res.user);
    } catch {
      setError('Incorrect login Id or password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0E2A] flex flex-col justify-center items-center p-4 sm:p-6 text-white relative overflow-hidden">
      {/* Background architectural curves */}
      <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full border border-white/5 pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full border border-white/5 pointer-events-none" />

      <div className="max-w-md w-full relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-7">
          <div className="inline-flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#2E2BE6] text-white font-display font-black text-base flex items-center justify-center shadow-md">
              AMT
            </div>
            <span className="font-display font-extrabold text-xl tracking-tight uppercase text-white">
              <span className="text-[#2E2BE6]">Task</span> Tracker
            </span>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-white text-slate-900 border border-slate-200 rounded-3xl p-7 sm:p-9 shadow-2xl">
          <h2 className="text-base font-black font-display text-slate-900 mb-5 uppercase tracking-tight">
            Sign in to Workspace
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider text-[10px]">
                Login ID or Work Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  id="input-login-email"
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@artmetech.in or login ID"
                  required
                  className="w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2E2BE6] bg-slate-50 font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider text-[10px]">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  id="input-login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2E2BE6] bg-slate-50 font-medium"
                />
                <button
                  id="btn-login-toggle-password"
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer transition-colors p-0.5 rounded"
                  title={showPassword ? 'Hide password' : 'Show password'}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              id="btn-login-submit"
              type="submit"
              disabled={isLoading}
              className={`w-full mt-2 py-3 px-4 rounded-full text-xs font-bold text-white shadow-sm flex items-center justify-center gap-2 transition-all ${
                isLoading ? 'bg-slate-400 cursor-not-allowed' : 'bg-[#2E2BE6] hover:bg-[#221fd4]'
              }`}
            >
              {isLoading ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Enter Workspace</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
