'use client';

import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';

const t = {
  en: {
    headline1: 'Never Train',
    headline2: 'Alone',
    tagline: 'Find workout partners who match your schedule and goals. Join group sessions or create your own.',
    getStarted: 'Get Started',
    howItWorks: 'How It Works',
    howSubtitle: 'Three simple steps to find your crew',
    step1: 'Browse Sessions',
    step1desc: 'Explore training sessions near you filtered by sport, skill level, and schedule.',
    step2: 'Join or Create',
    step2desc: 'Request to join a session or create your own and let others find you.',
    step3: 'Train Together',
    step3desc: 'Meet up, push each other, and build your fitness community.',
    stopTraining: 'Stop Training Alone',
    stopSubtitle: 'Your next training partner is one tap away.',
    signUpFree: 'Sign Up Free',
    contact: 'Contact',
    instagram: 'Instagram',
    appStorePrefix: 'Download on the',
    playStorePrefix: 'GET IT ON',
    copyright: '\u00A9 2026 Tribe. Never train alone.',
  },
  es: {
    headline1: 'Nunca Entrenes',
    headline2: 'Solo',
    tagline:
      'Encuentra compañeros de entrenamiento que se adapten a tu horario y metas. Únete a sesiones grupales o crea las tuyas.',
    getStarted: 'Comenzar',
    howItWorks: 'Cómo Funciona',
    howSubtitle: 'Tres simples pasos para encontrar a tu grupo',
    step1: 'Explora Sesiones',
    step1desc: 'Explora sesiones de entrenamiento cerca de ti, filtradas por deporte, nivel y horario.',
    step2: 'Únete o Crea',
    step2desc: 'Solicita unirte a una sesión o crea la tuya y deja que otros te encuentren.',
    step3: 'Entrena Juntos',
    step3desc: 'Reúnete, motívense mutuamente y construye tu comunidad fitness.',
    stopTraining: 'Deja de Entrenar Solo',
    stopSubtitle: 'Tu próximo compañero de entrenamiento está a un tap de distancia.',
    signUpFree: 'Regístrate Gratis',
    contact: 'Contacto',
    instagram: 'Instagram',
    appStorePrefix: 'Descargar en',
    playStorePrefix: 'DISPONIBLE EN',
    copyright: '\u00A9 2026 Tribe. Nunca entrenes solo.',
  },
} as const;

const PHOTOS = {
  hero: '/landing-hero.jpg',
  rowers: '/landing-rowers.jpg',
  deadlift: '/landing-deadlift.jpg',
  cycling: 'https://images.unsplash.com/photo-1517649763962-0c623066013b?w=600&q=80',
  running: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=600&q=80',
};

const PLAY_STORE = 'https://play.google.com/store/apps/details?id=prod.tribe.android';
const APP_STORE = 'https://apps.apple.com/us/app/tribe-never-train-alone/id6458219258';

const STEPS = [
  { icon: '🔍', num: '01' },
  { icon: '🤝', num: '02' },
  { icon: '💪', num: '03' },
] as const;

function StoreBadges({ appStorePrefix, playStorePrefix }: { appStorePrefix: string; playStorePrefix: string }) {
  return (
    <div className="tl-store-row">
      <a href={APP_STORE} target="_blank" rel="noopener noreferrer" className="tl-store-badge">
        <svg className="tl-store-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
        </svg>
        <div className="tl-store-text">
          <span className="tl-store-small">{appStorePrefix}</span>
          <span className="tl-store-large">App Store</span>
        </div>
      </a>
      <a href={PLAY_STORE} target="_blank" rel="noopener noreferrer" className="tl-store-badge">
        <svg className="tl-store-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3.61 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734c0-.382.218-.718.61-.92zM14.852 13.06l2.71 2.71-11.378 6.39 8.668-9.1zM21.41 10.89l-3.27 1.838-2.98-2.98 2.98-2.98 3.27 1.838c.93.522.93 1.762 0 2.284zM6.184 2.84l11.378 6.39-2.71 2.71-8.668-9.1z" />
        </svg>
        <div className="tl-store-text">
          <span className="tl-store-small">{playStorePrefix}</span>
          <span className="tl-store-large">Google Play</span>
        </div>
      </a>
    </div>
  );
}

export default function LandingPage(): JSX.Element {
  const { language, setLanguage } = useLanguage();
  const s = t[language];

  return (
    <div className="tribe-landing">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />

      {/* Hero */}
      <section className="tl-hero">
        <div className="tl-lang-toggle">
          {(['en', 'es'] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => setLanguage(lang)}
              className={`tl-lang-btn ${language === lang ? 'tl-lang-active' : ''}`}
            >
              {lang.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="tl-hero-glow" />
        <div className="tl-container tl-hero-grid">
          <div className="tl-hero-text">
            <div className="tl-logo">
              <img src="/tribe-wordmark.png" alt="Tribe" className="tl-logo-img" />
            </div>
            <h1 className="tl-headline">
              {s.headline1}
              <br />
              <span className="tl-green">{s.headline2}</span>
            </h1>
            <p className="tl-tagline">{s.tagline}</p>
            <div className="tl-cta-row">
              <Link href="/auth" className="tl-btn tl-btn-primary">
                {s.getStarted}
              </Link>
            </div>
            <StoreBadges appStorePrefix={s.appStorePrefix} playStorePrefix={s.playStorePrefix} />
          </div>
          <div className="tl-hero-visual">
            <div className="tl-photo-grid">
              <div className="tl-photo tl-photo-main">
                <img src={PHOTOS.hero} alt="Barbell training" style={{ objectPosition: 'center 35%' }} />
              </div>
              <div className="tl-photo tl-photo-sm tl-photo-1">
                <img src={PHOTOS.rowers} alt="CrossFit community handshake" style={{ objectPosition: 'top' }} />
              </div>
              <div className="tl-photo tl-photo-sm tl-photo-2">
                <img src={PHOTOS.deadlift} alt="Deadlift training" style={{ objectPosition: 'center 30%' }} />
              </div>
              <div className="tl-photo tl-photo-sm tl-photo-3">
                <img src={PHOTOS.cycling} alt="Cycling" style={{ objectPosition: 'center' }} />
              </div>
              <div className="tl-photo tl-photo-sm tl-photo-4">
                <img src={PHOTOS.running} alt="Running" style={{ objectPosition: 'center' }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="tl-how">
        <div className="tl-container">
          <h2 className="tl-section-title">{s.howItWorks}</h2>
          <p className="tl-section-sub">{s.howSubtitle}</p>
          <div className="tl-steps">
            {([s.step1, s.step2, s.step3] as const).map((title, i) => (
              <div className="tl-step" key={i}>
                <div className="tl-step-num">{STEPS[i].num}</div>
                <div className="tl-step-icon">{STEPS[i].icon}</div>
                <h3 className="tl-step-title">{title}</h3>
                <p className="tl-step-desc">{[s.step1desc, s.step2desc, s.step3desc][i]}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="tl-final">
        <div className="tl-final-glow" />
        <div className="tl-container tl-final-inner">
          <h2 className="tl-final-title">{s.stopTraining}</h2>
          <p className="tl-final-sub">{s.stopSubtitle}</p>
          <div className="tl-cta-row tl-cta-center">
            <Link href="/auth" className="tl-btn tl-btn-primary">
              {s.signUpFree}
            </Link>
          </div>
          <div className="tl-store-row tl-cta-center">
            <StoreBadges appStorePrefix={s.appStorePrefix} playStorePrefix={s.playStorePrefix} />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="tl-footer">
        <div className="tl-container tl-footer-inner">
          <div className="tl-footer-brand">
            <img src="/tribe-wordmark.png" alt="Tribe" className="tl-logo-img tl-footer-logo" />
          </div>
          <div className="tl-footer-links">
            <a href="mailto:alainalisca@aplusfitnessllc.com">{s.contact}</a>
            <a href="https://www.instagram.com/tribe.nevertrainalone" target="_blank" rel="noopener noreferrer">
              {s.instagram}
            </a>
          </div>
          <p className="tl-copyright">{s.copyright}</p>
        </div>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: landingStyles }} />
    </div>
  );
}

const landingStyles = `
/* ─── Reset & Base ─── */
.tribe-landing {
  font-family: 'Inter', sans-serif;
  color: #fff;
  background: #272D34;
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
}
.tribe-landing *, .tribe-landing *::before, .tribe-landing *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
.tribe-landing a { color: inherit; text-decoration: none; }
.tribe-landing img { display: block; width: 100%; height: 100%; object-fit: cover; }

/* ─── Layout ─── */
.tribe-landing .tl-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
}

/* ─── Hero ─── */
.tribe-landing .tl-hero {
  position: relative;
  background: #272D34;
  padding: 100px 0 80px;
  overflow: hidden;
}
.tribe-landing .tl-hero-glow {
  position: absolute;
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, rgba(192,232,99,0.12) 0%, transparent 70%);
  top: -100px;
  left: -100px;
  border-radius: 50%;
  animation: tlPulseGlow 6s ease-in-out infinite;
}
.tribe-landing .tl-hero-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 60px;
  align-items: center;
}
.tribe-landing .tl-logo {
  margin-bottom: 44px;
}
.tribe-landing .tl-logo-img {
  width: auto;
  height: 72px;
  object-fit: contain;
}
.tribe-landing .tl-footer-logo {
  height: 32px;
}
.tribe-landing .tl-headline {
  font-family: 'Archivo Black', sans-serif;
  font-size: clamp(40px, 5vw, 64px);
  line-height: 1.05;
  letter-spacing: -1.5px;
  margin-bottom: 20px;
  animation: tlSlideUp 0.8s ease-out both;
}
.tribe-landing .tl-green { color: #C0E863; }
.tribe-landing .tl-tagline {
  font-size: 18px;
  line-height: 1.6;
  color: #b0b8c1;
  max-width: 480px;
  margin-bottom: 36px;
  animation: tlSlideUp 0.8s 0.15s ease-out both;
}

/* ─── Buttons ─── */
.tribe-landing .tl-cta-row {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  animation: tlSlideUp 0.8s 0.3s ease-out both;
}
.tribe-landing .tl-cta-center { justify-content: center; }
.tribe-landing .tl-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 14px 28px;
  border-radius: 12px;
  font-family: 'Inter', sans-serif;
  font-weight: 600;
  font-size: 15px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s, background 0.2s;
  border: none;
  min-height: 48px;
}
.tribe-landing .tl-btn:hover { transform: translateY(-2px); }
.tribe-landing .tl-btn:active { transform: translateY(0); }
.tribe-landing .tl-btn-primary {
  background: #C0E863;
  color: #1a1f25;
  box-shadow: 0 4px 20px rgba(192,232,99,0.3);
}
.tribe-landing .tl-btn-primary:hover { box-shadow: 0 6px 28px rgba(192,232,99,0.45); }

/* ─── Store Badges ─── */
.tribe-landing .tl-store-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 20px;
  animation: tlSlideUp 0.8s 0.45s ease-out both;
}
.tribe-landing .tl-store-badge {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  background: #000;
  color: #fff;
  padding: 8px 16px 8px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.2);
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  min-height: 48px;
}
.tribe-landing .tl-store-badge:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.3);
}
.tribe-landing .tl-store-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}
.tribe-landing .tl-store-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.tribe-landing .tl-store-small {
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0.3px;
  text-transform: uppercase;
}
.tribe-landing .tl-store-large {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.2px;
}

/* ─── Photo Grid ─── */
.tribe-landing .tl-hero-visual {
  animation: tlFadeIn 1s 0.4s ease-out both;
}
.tribe-landing .tl-photo-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto auto;
  gap: 12px;
  max-width: 520px;
  margin: 0 auto;
}
.tribe-landing .tl-photo {
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
}
.tribe-landing .tl-photo-main {
  grid-column: 1 / -1;
  border-radius: 16px;
  aspect-ratio: 16/9;
}
.tribe-landing .tl-photo-sm {
  border-radius: 12px;
  aspect-ratio: 1;
}

/* ─── How It Works — Dark ─── */
.tribe-landing .tl-how {
  background: #1a1f25;
  color: #fff;
  padding: 80px 0;
}
.tribe-landing .tl-section-title {
  font-family: 'Archivo Black', sans-serif;
  font-size: clamp(28px, 4vw, 42px);
  text-align: center;
  letter-spacing: -1px;
  margin-bottom: 12px;
  color: #fff;
}
.tribe-landing .tl-section-sub {
  text-align: center;
  color: #8a929a;
  font-size: 17px;
  margin-bottom: 56px;
}
.tribe-landing .tl-steps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 28px;
}
.tribe-landing .tl-step {
  position: relative;
  text-align: center;
  padding: 40px 24px;
  border-radius: 20px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  overflow: hidden;
  transition: transform 0.3s, box-shadow 0.3s;
}
.tribe-landing .tl-step:hover {
  transform: translateY(-6px);
  box-shadow: 0 12px 40px rgba(0,0,0,0.25);
}
.tribe-landing .tl-step-num {
  position: absolute;
  top: -10px;
  right: 16px;
  font-family: 'Archivo Black', sans-serif;
  font-size: 100px;
  color: rgba(255,255,255,0.04);
  line-height: 1;
  pointer-events: none;
}
.tribe-landing .tl-step-icon {
  font-size: 40px;
  margin-bottom: 20px;
}
.tribe-landing .tl-step-title {
  font-family: 'Archivo Black', sans-serif;
  font-size: 20px;
  margin-bottom: 12px;
  letter-spacing: -0.3px;
  color: #fff;
}
.tribe-landing .tl-step-desc {
  font-size: 15px;
  line-height: 1.6;
  color: #8a929a;
}

/* ─── Final CTA ─── */
.tribe-landing .tl-final {
  position: relative;
  background: #272D34;
  padding: 80px 0;
  overflow: hidden;
  text-align: center;
}
.tribe-landing .tl-final-glow {
  position: absolute;
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, rgba(192,232,99,0.1) 0%, transparent 70%);
  bottom: -150px;
  right: -100px;
  border-radius: 50%;
  animation: tlPulseGlow 6s 3s ease-in-out infinite;
}
.tribe-landing .tl-final-inner { position: relative; z-index: 1; }
.tribe-landing .tl-final-title {
  font-family: 'Archivo Black', sans-serif;
  font-size: clamp(32px, 4.5vw, 52px);
  letter-spacing: -1.5px;
  margin-bottom: 16px;
}
.tribe-landing .tl-final-sub {
  color: #b0b8c1;
  font-size: 17px;
  max-width: 520px;
  margin: 0 auto 40px;
  line-height: 1.6;
}
.tribe-landing .tl-final .tl-store-row { justify-content: center; margin-top: 16px; }

/* ─── Footer ─── */
.tribe-landing .tl-footer {
  background: #1e2228;
  padding: 48px 0;
}
.tribe-landing .tl-footer-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}
.tribe-landing .tl-footer-links {
  display: flex;
  gap: 28px;
}
.tribe-landing .tl-footer-links a {
  font-size: 14px;
  color: #7F8C8D;
  transition: color 0.2s;
}
.tribe-landing .tl-footer-links a:hover { color: #C0E863; }
.tribe-landing .tl-copyright {
  font-size: 13px;
  color: #555;
}

/* ─── Language Toggle ─── */
.tribe-landing .tl-lang-toggle {
  position: absolute;
  top: 16px;
  right: 24px;
  z-index: 10;
  display: flex;
  background: rgba(255,255,255,0.1);
  border-radius: 9999px;
  padding: 3px;
}
.tribe-landing .tl-lang-btn {
  padding: 8px 16px;
  min-height: 44px;
  border-radius: 9999px;
  border: none;
  background: transparent;
  color: rgba(255,255,255,0.5);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
  touch-action: manipulation;
}
.tribe-landing .tl-lang-btn:hover { color: #fff; }
.tribe-landing .tl-lang-btn.tl-lang-active {
  background: #C0E863;
  color: #1a1f25;
}

/* ─── Animations ─── */
@keyframes tlSlideUp {
  from { opacity: 0; transform: translateY(30px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes tlFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes tlPulseGlow {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50%      { opacity: 1; transform: scale(1.1); }
}

/* ─── Responsive: Tablet ─── */
@media (max-width: 1024px) {
  .tribe-landing .tl-hero-grid {
    grid-template-columns: 1fr;
    gap: 48px;
  }
  .tribe-landing .tl-hero-text { text-align: center; }
  .tribe-landing .tl-tagline { margin-left: auto; margin-right: auto; }
  .tribe-landing .tl-cta-row { justify-content: center; }
  .tribe-landing .tl-store-row { justify-content: center; }
  .tribe-landing .tl-photo-grid { max-width: 420px; }
  .tribe-landing .tl-steps { grid-template-columns: 1fr; max-width: 440px; margin: 0 auto; gap: 20px; }
}

/* ─── Responsive: Mobile ─── */
@media (max-width: 768px) {
  .tribe-landing .tl-hero { padding: 48px 0 40px; }
  .tribe-landing .tl-hero-grid { gap: 32px; }
  .tribe-landing .tl-hero-visual { order: 1; }
  .tribe-landing .tl-hero-text { order: 0; }
  .tribe-landing .tl-logo-img { height: 56px; }
  .tribe-landing .tl-logo { margin-bottom: 40px; }
  .tribe-landing .tl-tagline { font-size: 16px; margin-bottom: 28px; }
  .tribe-landing .tl-cta-row { flex-direction: column; align-items: center; }
  .tribe-landing .tl-btn { width: 100%; max-width: 300px; justify-content: center; }
  .tribe-landing .tl-photo-grid { max-width: 100%; gap: 8px; }
  .tribe-landing .tl-how { padding: 56px 0; }
  .tribe-landing .tl-section-sub { font-size: 15px; margin-bottom: 36px; }
  .tribe-landing .tl-steps { gap: 16px; }
  .tribe-landing .tl-step { padding: 28px 20px; }
  .tribe-landing .tl-final { padding: 56px 0; }
  .tribe-landing .tl-final-sub { font-size: 15px; }
}

/* ─── Light Mode ─── */
:root:not(.dark) .tribe-landing {
  color: #1a1f25;
  background: #f5f5f5;
}
:root:not(.dark) .tribe-landing .tl-hero {
  background: #ffffff;
}
:root:not(.dark) .tribe-landing .tl-hero-glow {
  background: radial-gradient(circle, rgba(192,232,99,0.08) 0%, transparent 70%);
}
:root:not(.dark) .tribe-landing .tl-tagline {
  color: #6b7280;
}
:root:not(.dark) .tribe-landing .tl-photo {
  box-shadow: 0 8px 24px rgba(0,0,0,0.1);
}
:root:not(.dark) .tribe-landing .tl-how {
  background: #f5f5f5;
  color: #1a1f25;
}
:root:not(.dark) .tribe-landing .tl-section-title {
  color: #1a1f25;
}
:root:not(.dark) .tribe-landing .tl-section-sub {
  color: #6b7280;
}
:root:not(.dark) .tribe-landing .tl-step {
  background: #ffffff;
  border-color: #e5e7eb;
}
:root:not(.dark) .tribe-landing .tl-step:hover {
  box-shadow: 0 12px 40px rgba(0,0,0,0.08);
}
:root:not(.dark) .tribe-landing .tl-step-num {
  color: rgba(0,0,0,0.04);
}
:root:not(.dark) .tribe-landing .tl-step-title {
  color: #1a1f25;
}
:root:not(.dark) .tribe-landing .tl-step-desc {
  color: #6b7280;
}
:root:not(.dark) .tribe-landing .tl-final {
  background: #ffffff;
}
:root:not(.dark) .tribe-landing .tl-final-glow {
  background: radial-gradient(circle, rgba(192,232,99,0.06) 0%, transparent 70%);
}
:root:not(.dark) .tribe-landing .tl-final-sub {
  color: #6b7280;
}
:root:not(.dark) .tribe-landing .tl-footer {
  background: #1a1f25;
  color: #fff;
}
:root:not(.dark) .tribe-landing .tl-footer-links a {
  color: #9ca3af;
}
:root:not(.dark) .tribe-landing .tl-copyright {
  color: #6b7280;
}
:root:not(.dark) .tribe-landing .tl-lang-toggle {
  background: rgba(0,0,0,0.08);
}
:root:not(.dark) .tribe-landing .tl-lang-btn {
  color: rgba(0,0,0,0.4);
}
:root:not(.dark) .tribe-landing .tl-lang-btn:hover {
  color: #1a1f25;
}
:root:not(.dark) .tribe-landing .tl-store-badge {
  border-color: rgba(0,0,0,0.15);
}
`;
