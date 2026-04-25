'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, ChevronRight, User, Bell, Shield, Languages,
  HelpCircle, Mail, Info, RefreshCw, AlertTriangle
} from 'lucide-react';
import { useState } from 'react';
import { useAppStore } from '@/store/appStore';

interface SettingItem {
  href?: string;
  label: string;
  icon: React.ReactNode;
  iconBg: string;
  value?: string;
  danger?: boolean;
  onClick?: () => void;
}

interface SettingGroup {
  title: string;
  items: SettingItem[];
}

export default function SettingsPage() {
  const router = useRouter();
  const { resetGuest } = useAppStore();
  const [showReset, setShowReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    setResetting(true);
    try {
      await resetGuest(); // calls DELETE /api/guest/reset
    } finally {
      setResetting(false);
      setShowReset(false);
      router.push('/splash');
    }
  };

  const groups: SettingGroup[] = [
    {
      title: 'Account',
      items: [
        { href: '/settings/profile', label: 'Profile', icon: <User size={18} className="text-primary-700" />, iconBg: 'bg-primary-100' },
        { href: '/settings/notifications', label: 'Notifications', icon: <Bell size={18} className="text-green-700" />, iconBg: 'bg-green-100' },
      ],
    },
    {
      title: 'Preferences',
      items: [
        { href: '/settings/privacy', label: 'Privacy & Social', icon: <Shield size={18} className="text-primary-700" />, iconBg: 'bg-primary-100' },
        { href: '/settings/language', label: 'Language', icon: <Languages size={18} className="text-violet-700" />, iconBg: 'bg-violet-100', value: 'English' },
      ],
    },
    {
      title: 'Help',
      items: [
        { href: '/settings/faq', label: 'Frequently Asked Questions', icon: <HelpCircle size={18} className="text-green-700" />, iconBg: 'bg-green-100' },
        { href: '/settings/contact', label: 'Contact Us', icon: <Mail size={18} className="text-green-700" />, iconBg: 'bg-green-100' },
        { href: '/settings/about', label: 'About', icon: <Info size={18} className="text-slate-600" />, iconBg: 'bg-slate-200' },
      ],
    },
    {
      title: 'Session',
      items: [
        {
          label: 'Reset Guest ID',
          icon: <RefreshCw size={18} className="text-red-600" />,
          iconBg: 'bg-red-100',
          danger: true,
          onClick: () => setShowReset(true),
        },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white px-4 py-4 flex items-center gap-3 border-b border-slate-100 sticky top-0 z-10">
        <button onClick={() => router.back()} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
          <ArrowLeft size={18} className="text-slate-600" />
        </button>
        <h1 className="text-lg font-bold text-slate-900 flex-1 text-center">Settings</h1>
        <div className="w-9" />
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-6">
        {groups.map((group) => (
          <div key={group.title}>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2 px-1">{group.title}</p>
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden divide-y divide-slate-100">
              {group.items.map((item, i) => {
                const content = (
                  <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${item.iconBg}`}>
                      {item.icon}
                    </div>
                    <span className={`flex-1 text-sm font-medium ${item.danger ? 'text-red-600' : 'text-slate-800'}`}>
                      {item.label}
                    </span>
                    {item.value && <span className="text-sm text-slate-400 mr-1">{item.value}</span>}
                    <ChevronRight size={16} className="text-slate-300 flex-shrink-0" />
                  </div>
                );

                if (item.onClick) {
                  return <button key={i} onClick={item.onClick} className="w-full text-left">{content}</button>;
                }
                return <Link key={i} href={item.href!}>{content}</Link>;
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Reset Dialog */}
      {showReset && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 px-4 pb-4 md:pb-0">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex flex-col items-center text-center mb-5">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-3">
                <AlertTriangle size={28} className="text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Reset Guest ID?</h3>
              <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                This will delete your session and create a new Guest ID. All history will be erased.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowReset(false)}
                disabled={resetting}
                className="flex-1 py-3 rounded-2xl border-2 border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                disabled={resetting}
                className="flex-1 py-3 rounded-2xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-60"
              >
                {resetting ? 'Resetting...' : 'Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
