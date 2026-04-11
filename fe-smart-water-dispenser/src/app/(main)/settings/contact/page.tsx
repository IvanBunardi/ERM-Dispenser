'use client';
import { useState } from 'react';
import { ArrowLeft, Send, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function ContactPage() {
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ subject: '', message: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-8 text-center">
        <div className="w-16 h-16 rounded-full bg-eco-100 flex items-center justify-center mb-4">
          <Check size={32} className="text-eco-500" />
        </div>
        <h2 className="text-lg font-bold text-slate-800 mb-2">Message Sent!</h2>
        <p className="text-sm text-slate-500">We will get back to you within 24 hours.</p>
        <button onClick={() => router.back()} className="mt-6 text-primary-700 text-sm font-semibold">Go Back</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white px-4 py-4 flex items-center gap-3 border-b border-slate-100 sticky top-0">
        <button onClick={() => router.back()} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
          <ArrowLeft size={18} className="text-slate-600" />
        </button>
        <h1 className="text-base font-semibold text-slate-800 flex-1 text-center">Contact Us</h1>
        <div className="w-9" />
      </div>
      <div className="max-w-md mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Subject</label>
            <input
              value={form.subject}
              onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              placeholder="e.g. Station issue at Auditorium"
              className="w-full border-2 border-slate-200 focus:border-primary-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-colors"
              required
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Message</label>
            <textarea
              value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              placeholder="Describe your issue or feedback..."
              rows={5}
              className="w-full border-2 border-slate-200 focus:border-primary-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-colors resize-none"
              required
            />
          </div>
          <button type="submit" className="w-full bg-primary-800 text-white font-semibold py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-primary-700 transition-colors">
            <Send size={16} />
            Send Message
          </button>
        </form>
      </div>
    </div>
  );
}
