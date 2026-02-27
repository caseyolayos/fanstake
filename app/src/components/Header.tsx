"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { WalletButton } from "./WalletButton";
import { MetaMaskWarning } from "./MetaMaskWarning";

interface HeaderProps {
  showNav?: boolean;
}

export function Header({ showNav = true }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <MetaMaskWarning />
      <header className="border-b border-gray-800 px-4 py-1 sticky top-0 z-50 bg-black/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">

          {/* Logo */}
          <Link
            href="/"
            className="flex items-center flex-shrink-0"
            onClick={() => setMenuOpen(false)}
          >
            <Image
              src="/logo.png"
              alt="FanStake"
              width={500}
              height={500}
              className="h-10 w-10 md:h-12 md:w-12 object-contain flex-shrink-0"
            />
          </Link>

          {showNav && (
            <>
              {/* Desktop nav */}
              <nav className="hidden md:flex items-center gap-5 flex-1 justify-center">
                <Link href="/" className="text-sm text-gray-400 hover:text-white transition whitespace-nowrap">
                  Discover
                </Link>
                <Link href="/launch" className="text-sm text-gray-400 hover:text-white transition whitespace-nowrap">
                  Launch Token
                </Link>
                <Link href="/portfolio" className="text-sm text-gray-400 hover:text-white transition whitespace-nowrap">
                  Portfolio
                </Link>
              </nav>

              {/* Desktop wallet button */}
              <div className="hidden md:block flex-shrink-0">
                <WalletButton />
              </div>

              {/* Mobile: wallet + hamburger */}
              <div className="flex md:hidden items-center gap-2 flex-shrink-0">
                <WalletButton compact />
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className="p-2 text-gray-400 hover:text-white transition rounded-lg hover:bg-gray-800"
                  aria-label="Toggle menu"
                >
                  {menuOpen ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  )}
                </button>
              </div>
            </>
          )}

          {/* No-nav mode (e.g. launch page): just wallet */}
          {!showNav && (
            <div className="flex-shrink-0">
              <WalletButton compact />
            </div>
          )}
        </div>

        {/* Mobile dropdown menu */}
        {showNav && menuOpen && (
          <div className="md:hidden mt-3 pb-3 border-t border-gray-800 pt-3 space-y-1">
            {[
              { href: "/", label: "Discover" },
              { href: "/launch", label: "Launch Token" },
              { href: "/portfolio", label: "Portfolio" },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-gray-900 rounded-lg transition"
              >
                {label}
              </Link>
            ))}
          </div>
        )}
      </header>
    </>
  );
}
