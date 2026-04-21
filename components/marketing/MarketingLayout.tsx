'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import { Menu, X } from 'lucide-react';

/* ═══════════════════════════════════════════
   MARKETING HEADER
   ═══════════════════════════════════════════ */

function MarketingHeader() {
  const { language, setLanguage } = useLanguage();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  /*
   * The MarketingLayout wrapper is bg-tribe-dark for every marketing route,
   * so the header sits on a dark background in both the transparent state
   * (over the hero) and the scrolled state (bg-tribe-dark/95). We used to
   * render /tribe-wordmark.png here, but that PNG had transparent letter
   * fills and only drew outlines, so the wordmark rendered as faint ghosts
   * on dark backgrounds. Switched to text-rendered wordmark for the same
   * reason as HeroSection.
   */

  const toggleLang = () => setLanguage(language === 'en' ? 'es' : 'en');

  const navLinks = [
    { href: '/', label: language === 'es' ? 'Para Atletas' : 'For Athletes' },
    { href: '/for-instructors', label: language === 'es' ? 'Para Instructores' : 'For Instructors' },
    { href: '/about', label: language === 'es' ? 'Sobre Nosotros' : 'About' },
    { href: '/faq', label: 'FAQ' },
  ];

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? 'bg-tribe-dark/95 backdrop-blur-md shadow-lg' : 'bg-transparent'
        }`}
      >
        <nav className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          {/* Wordmark — text, not a PNG. See note above on why. */}
          <Link
            href="/"
            className="flex items-baseline leading-none font-black tracking-tight text-white text-2xl"
            aria-label="Tribe"
          >
            <span>Tribe</span>
            <span className="text-tribe-green-light">.</span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-400">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-white transition-colors">
                {link.label}
              </Link>
            ))}
          </div>

          {/* CTA area */}
          <div className="hidden md:flex items-center gap-3">
            <button onClick={toggleLang} className="text-sm text-gray-400 hover:text-white transition-colors">
              {language === 'es' ? 'EN' : 'ES'}
            </button>
            <Link href="/auth" className="text-sm font-semibold text-white hover:text-tribe-green transition-colors">
              {language === 'es' ? 'Iniciar Sesión' : 'Sign In'}
            </Link>
            <Link
              href="/auth"
              className="px-4 py-2 bg-tribe-green text-tribe-dark text-sm font-bold rounded-lg hover:bg-tribe-green-hover transition-colors"
            >
              {language === 'es' ? 'Únete al Tribe' : 'Join Tribe'}
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button className="md:hidden text-white p-2" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </nav>
      </header>

      {/* Mobile menu overlay */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 bg-tribe-dark/98 backdrop-blur-md pt-20 px-6 md:hidden">
          <div className="flex flex-col gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-lg font-semibold text-white hover:text-tribe-green transition-colors"
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <hr className="border-tribe-mid" />
            <button
              onClick={() => {
                toggleLang();
                setMenuOpen(false);
              }}
              className="text-sm text-gray-400 hover:text-white text-left"
            >
              {language === 'es' ? 'Switch to English' : 'Cambiar a Español'}
            </button>
            <Link href="/auth" className="text-lg font-semibold text-white" onClick={() => setMenuOpen(false)}>
              {language === 'es' ? 'Iniciar Sesión' : 'Sign In'}
            </Link>
            <Link
              href="/auth"
              className="inline-block text-center px-6 py-3 bg-tribe-green text-tribe-dark font-bold rounded-lg"
              onClick={() => setMenuOpen(false)}
            >
              {language === 'es' ? 'Únete al Tribe' : 'Join Tribe'}
            </Link>
          </div>
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════
   MARKETING FOOTER
   ═══════════════════════════════════════════ */

function MarketingFooter() {
  const { language } = useLanguage();

  const t = (en: string, es: string) => (language === 'es' ? es : en);

  return (
    <footer className="bg-tribe-dark border-t border-tribe-mid py-12 px-4">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Brand */}
        <div>
          {/* Footer bg is tribe-dark. Text wordmark — see MarketingHeader note. */}
          <div
            className="flex items-baseline leading-none font-black tracking-tight text-white text-2xl mb-2"
            aria-label="Tribe"
          >
            <span>Tribe</span>
            <span className="text-tribe-green-light">.</span>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            {t('Never Train Alone in Medellín', 'Nunca Entrenes Solo en Medellín')}
          </p>
          {/* TODO: Al — add real App Store / Play Store badge images to public/images/ */}
          <div className="flex gap-3">
            <a
              href="https://apps.apple.com" // TODO: Al — replace with real App Store URL
              className="block px-3 py-1.5 border border-tribe-mid rounded-lg text-xs text-gray-400 hover:text-white transition-colors"
            >
              App Store
            </a>
            <a
              href="https://play.google.com" // TODO: Al — replace with real Play Store URL
              className="block px-3 py-1.5 border border-tribe-mid rounded-lg text-xs text-gray-400 hover:text-white transition-colors"
            >
              Google Play
            </a>
          </div>
        </div>

        {/* Product */}
        <div>
          <h3 className="text-sm font-bold text-white mb-3">{t('Product', 'Producto')}</h3>
          <ul className="space-y-2 text-sm text-gray-500">
            <li>
              <Link href="/" className="hover:text-white transition-colors">
                {t('For Athletes', 'Para Atletas')}
              </Link>
            </li>
            <li>
              <Link href="/for-instructors" className="hover:text-white transition-colors">
                {t('For Instructors', 'Para Instructores')}
              </Link>
            </li>
            <li>
              <Link href="/faq" className="hover:text-white transition-colors">
                FAQ
              </Link>
            </li>
          </ul>
        </div>

        {/* Company */}
        <div>
          <h3 className="text-sm font-bold text-white mb-3">{t('Company', 'Empresa')}</h3>
          <ul className="space-y-2 text-sm text-gray-500">
            <li>
              <Link href="/about" className="hover:text-white transition-colors">
                {t('About Us', 'Sobre Nosotros')}
              </Link>
            </li>
            <li>
              {/* TODO: Al — replace with real support email */}
              <a href="mailto:support@tribe.fitness" className="hover:text-white transition-colors">
                {t('Contact', 'Contacto')}
              </a>
            </li>
            <li>
              {/* TODO: Al — replace TRIBE_HANDLE with real Instagram handle */}
              <a
                href="https://instagram.com/TRIBE_HANDLE"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                Instagram
              </a>
            </li>
          </ul>
        </div>

        {/* Legal */}
        <div>
          <h3 className="text-sm font-bold text-white mb-3">Legal</h3>
          <ul className="space-y-2 text-sm text-gray-500">
            <li>
              <Link href="/legal/terms" className="hover:text-white transition-colors">
                {t('Terms of Service', 'Términos de Servicio')}
              </Link>
            </li>
            <li>
              <Link href="/legal/privacy" className="hover:text-white transition-colors">
                {t('Privacy Policy', 'Política de Privacidad')}
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="max-w-6xl mx-auto mt-8 pt-8 border-t border-tribe-mid text-center text-xs text-gray-600">
        © {new Date().getFullYear()} A+ Fitness LLC. {t('All rights reserved.', 'Todos los derechos reservados.')}
      </div>
    </footer>
  );
}

/* ═══════════════════════════════════════════
   MARKETING LAYOUT WRAPPER
   ═══════════════════════════════════════════ */

interface MarketingLayoutProps {
  children: React.ReactNode;
  /** Set to true to remove default top padding (e.g., for full-bleed hero) */
  fullBleed?: boolean;
}

export default function MarketingLayout({ children, fullBleed = false }: MarketingLayoutProps) {
  return (
    <div className="min-h-screen bg-tribe-dark text-white">
      <MarketingHeader />
      <main className={fullBleed ? '' : 'pt-20'}>{children}</main>
      <MarketingFooter />
    </div>
  );
}
