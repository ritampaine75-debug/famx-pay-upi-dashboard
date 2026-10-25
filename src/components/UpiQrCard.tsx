import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Download, AlertCircle, Printer } from 'lucide-react';
import { formatInrFromPaise } from '../lib/domain';

interface UpiQrCardProps {
  upiUri: string;
  merchantName: string;
  merchantUpiId: string;
  amountPaise: number;
  orderId: string;
  compact?: boolean;
}

export function UpiQrCard({
  upiUri,
  merchantName,
  merchantUpiId,
  amountPaise,
  orderId,
  compact = false,
}: UpiQrCardProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!upiUri || !upiUri.startsWith('upi://pay?')) {
      setQrDataUrl(null);
      setQrError('Valid UPI payment URI is required to generate a QR code.');
      return;
    }

    QRCode.toDataURL(upiUri, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 360,
      color: {
        dark: '#171717',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (active) {
          setQrDataUrl(url);
          setQrError(null);
        }
      })
      .catch((err) => {
        if (active) {
          setQrDataUrl(null);
          setQrError(err instanceof Error ? err.message : 'Failed to encode QR matrix.');
        }
      });

    return () => {
      active = false;
    };
  }, [upiUri]);

  const handleDownloadPng = async () => {
    if (!qrDataUrl) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 820;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Border
      ctx.strokeStyle = '#E5E2DC';
      ctx.lineWidth = 4;
      ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

      // Header text
      ctx.fillStyle = '#666666';
      ctx.font = '500 18px "Public Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('FAMX PAY · UPI PAYMENT REQUEST', canvas.width / 2, 76);

      ctx.fillStyle = '#171717';
      ctx.font = '700 32px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(merchantName.slice(0, 32), canvas.width / 2, 124);

      ctx.fillStyle = '#666666';
      ctx.font = '400 20px "JetBrains Mono", monospace';
      ctx.fillText(merchantUpiId, canvas.width / 2, 158);

      // Amount
      ctx.fillStyle = '#171717';
      ctx.font = '700 44px "JetBrains Mono", monospace';
      ctx.fillText(formatInrFromPaise(amountPaise), canvas.width / 2, 224);

      // Draw QR image
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load QR image onto canvas'));
        img.src = qrDataUrl;
      });

      const qrSize = 420;
      ctx.drawImage(img, (canvas.width - qrSize) / 2, 250, qrSize, qrSize);

      // Footer reference
      ctx.fillStyle = '#171717';
      ctx.font = '600 20px "JetBrains Mono", monospace';
      ctx.fillText(`Order Reference: ${orderId}`, canvas.width / 2, 715);

      ctx.fillStyle = '#666666';
      ctx.font = '400 16px "Public Sans", sans-serif';
      ctx.fillText('Scan with any BHIM UPI compatible application', canvas.width / 2, 755);

      const compositeUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = compositeUrl;
      link.download = `FamXPay-${orderId}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      // Fallback to direct QR data URL download
      const link = document.createElement('a');
      link.href = qrDataUrl;
      link.download = `FamXPay-${orderId}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (qrError) {
    return (
      <div className="p-5 bg-[#FEF2F2] border border-[#FECACA] rounded-xl text-[#991B1B] text-sm flex items-start gap-3">
        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">QR Code Generation Failed</p>
          <p className="mt-1 text-xs">{qrError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 flex flex-col items-center text-center">
      <div className="text-xs text-[#666666] mb-1">
        <span>{merchantName}</span>
        <span aria-hidden="true"> · </span>
        <span className="font-mono">{merchantUpiId}</span>
      </div>
      <div className="text-2xl font-bold font-mono tabular-nums text-[#171717] mb-3">
        {formatInrFromPaise(amountPaise)}
      </div>

      <div
        className={`${
          compact ? 'w-48 h-48' : 'w-60 h-60'
        } bg-white border border-[#E5E2DC] rounded-lg p-2 flex items-center justify-center`}
      >
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt={`UPI QR code for ${merchantName}, amount ${formatInrFromPaise(amountPaise)}, order ${orderId}`}
            referrerPolicy="no-referrer"
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="text-xs text-[#666666]">Generating QR matrix...</div>
        )}
      </div>

      <p className="mt-3 text-xs text-[#666666] font-mono tabular-nums">
        Ref: {orderId} · Currency: INR
      </p>

      <div className="mt-4 flex items-center gap-2 w-full justify-center print:hidden">
        <button
          type="button"
          onClick={handleDownloadPng}
          disabled={!qrDataUrl}
          className="px-3.5 py-2 text-xs font-medium bg-[#242424] text-white rounded-lg hover:bg-[#171717] disabled:opacity-50 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          Download QR PNG
        </button>
        {!compact && (
          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-2 text-xs font-medium bg-[#F7F6F2] text-[#171717] border border-[#E5E2DC] rounded-lg hover:bg-[#ECEAE3] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Slip
          </button>
        )}
      </div>
    </div>
  );
}
