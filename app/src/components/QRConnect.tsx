"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

interface QRConnectProps {
  onClose: () => void;
}

export function QRConnect({ onClose }: QRConnectProps) {
  const [phantomUrl, setPhantomUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Build Phantom deep link that opens this page inside Phantom's in-app browser
    const pageUrl = window.location.href;
    const origin = window.location.origin;
    const encoded = encodeURIComponent(pageUrl);
    const ref = encodeURIComponent(origin);
    setPhantomUrl(`https://phantom.app/ul/browse/${encoded}?ref=${ref}`);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(phantomUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/80 backdrop-blur-sm px-4 py-8 overflow-y-auto">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl my-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-white text-lg">Scan with your phone</h3>
            <p className="text-xs text-gray-500 mt-0.5">Opens in Phantom's built-in browser</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* QR Code */}
        <div className="bg-white rounded-2xl p-4 flex items-center justify-center mb-5">
          {phantomUrl ? (
            <QRCodeSVG
              value={phantomUrl}
              size={220}
              bgColor="#ffffff"
              fgColor="#000000"
              level="M"
            />
          ) : (
            <div className="w-[220px] h-[220px] flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="space-y-2 text-sm text-gray-400 mb-5">
          <div className="flex items-start gap-2">
            <span className="text-purple-400 font-bold flex-shrink-0">1.</span>
            <span>Open your phone&apos;s camera and scan the QR code</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-purple-400 font-bold flex-shrink-0">2.</span>
            <span>Tap the link — it opens inside Phantom&apos;s browser</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-purple-400 font-bold flex-shrink-0">3.</span>
            <span>Connect wallet and trade from there</span>
          </div>
        </div>

        {/* Copy link fallback */}
        <button
          onClick={handleCopy}
          className="w-full py-2.5 text-sm border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-white rounded-xl transition"
        >
          {copied ? "✅ Copied!" : "📋 Copy link instead"}
        </button>

        <p className="text-xs text-gray-600 text-center mt-3">
          Works with Phantom, Solflare, and other Solana wallets
        </p>
      </div>
    </div>
  );
}
