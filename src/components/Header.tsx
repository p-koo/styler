'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface HeaderProps {
  currentPage?: 'home' | 'editor' | 'settings' | 'about';
}

export default function Header({ currentPage }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navItems = [
    { href: '/', label: 'Home', page: 'home' as const },
    { href: '/editor', label: 'Editor', page: 'editor' as const },
    { href: '/settings', label: 'Settings', page: 'settings' as const },
    { href: '/about', label: 'About', page: 'about' as const },
  ];

  return (
    <header className="border-b border-[var(--border)] bg-[var(--background)]">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo with dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <Image
              src="/logo.png"
              alt="Styler Logo"
              width={32}
              height={32}
              className="rounded"
            />
            <span className="text-xl font-semibold text-[var(--foreground)]">
              Styler
            </span>
            <svg
              className={`w-4 h-4 text-[var(--muted-foreground)] transition-transform ${menuOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Dropdown menu */}
          {menuOpen && (
            <div className="absolute top-full left-0 mt-1 w-48 bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-lg py-1 z-50">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={`block px-4 py-2 text-sm transition-colors ${
                    currentPage === item.page
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                      : 'text-[var(--foreground)] hover:bg-[var(--muted)]'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Right side - can add additional items here */}
        <div className="flex items-center gap-4">
          {currentPage !== 'editor' && (
            <Link
              href="/editor"
              className="px-4 py-2 text-sm bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 transition-opacity"
            >
              Open Editor
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
