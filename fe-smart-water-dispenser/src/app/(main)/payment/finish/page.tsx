'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import Link from 'next/link';

function PaymentFinishContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const orderId = searchParams.get('order_id');
  const transactionStatus = searchParams.get('transaction_status');
  const statusCode = searchParams.get('status_code');

  let statusConfig = {
    icon: <Clock size={48} className="text-blue-500" />,
    title: 'Memproses Pembayaran...',
    desc: 'Mohon tunggu sebentar, kami sedang mengecek status pembayaran Anda.',
    bgColor: 'bg-blue-50'
  };

  if (transactionStatus === 'settlement' || transactionStatus === 'capture' || statusCode === '200') {
    statusConfig = {
      icon: <CheckCircle size={48} className="text-green-500" />,
      title: 'Pembayaran Berhasil!',
      desc: 'Terima kasih, pembayaran Anda telah kami terima. Silakan kembali ke dispenser untuk mengambil air minum Anda.',
      bgColor: 'bg-green-50'
    };
  } else if (transactionStatus === 'pending' || statusCode === '201') {
    statusConfig = {
      icon: <Clock size={48} className="text-yellow-500" />,
      title: 'Menunggu Pembayaran',
      desc: 'Silakan selesaikan pembayaran Anda melalui aplikasi e-wallet atau m-banking.',
      bgColor: 'bg-yellow-50'
    };
  } else if (transactionStatus === 'cancel' || transactionStatus === 'deny' || transactionStatus === 'expire' || statusCode !== null) {
    statusConfig = {
      icon: <XCircle size={48} className="text-red-500" />,
      title: 'Pembayaran Gagal',
      desc: 'Maaf, pembayaran Anda gagal, dibatalkan, atau telah kedaluwarsa. Silakan coba kembali.',
      bgColor: 'bg-red-50'
    };
  }

  return (
    <div className="bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white max-w-sm w-full rounded-3xl shadow-sm border border-slate-100 p-8 text-center">
        <div className={`w-24 h-24 mx-auto ${statusConfig.bgColor} rounded-full flex items-center justify-center mb-6`}>
          {statusConfig.icon}
        </div>
        
        <h1 className="text-2xl font-bold text-slate-800 mb-2">
          {statusConfig.title}
        </h1>
        
        <p className="text-slate-500 text-sm mb-8 leading-relaxed">
          {statusConfig.desc}
        </p>
        
        {orderId && (
          <div className="bg-slate-50 rounded-xl p-3 mb-8">
            <p className="text-xs text-slate-400 mb-1">Order ID</p>
            <p className="text-sm font-mono font-medium text-slate-700">{orderId}</p>
          </div>
        )}

        <Link 
          href="/explore" 
          className="block w-full bg-primary-600 text-white font-semibold py-3.5 rounded-2xl hover:bg-primary-700 transition-colors"
        >
          Kembali ke Beranda
        </Link>
      </div>
    </div>
  );
}

export default function PaymentFinishPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>}>
      <PaymentFinishContent />
    </Suspense>
  );
}
