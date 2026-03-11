'use client';

import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';

const t = {
  en: {
    headline1: 'Never Train',
    headline2: 'Alone',
    tagline: 'Find workout partners who match your schedule and goals. Join group sessions or create your own.',
    getStarted: 'Get Started',
    googlePlay: 'Get it on Google Play',
    appStore: 'App Store',
    howItWorks: 'How It Works',
    howSubtitle: 'Three simple steps to find your training crew',
    step1: 'Browse Sessions',
    step1desc: 'Explore training sessions near you filtered by sport, skill level, and schedule.',
    step2: 'Join or Create',
    step2desc: 'Request to join a session or create your own and let others find you.',
    step3: 'Train Together',
    step3desc: 'Meet up, push each other, and build your fitness community.',
    stopTraining: 'Stop Training Alone',
    stopSubtitle: 'Join hundreds of athletes already finding their training partners on Tribe.',
    signUpFree: 'Sign Up Free',
    about: 'About',
    contact: 'Contact',
    instagram: 'Instagram',
    copyright: '© 2025 Tribe. Never train alone.',
    crossfit: 'CrossFit',
    yoga: 'Yoga Flow',
    group: 'Group Training',
    running: 'Trail Running',
  },
  es: {
    headline1: 'Nunca Entrenes',
    headline2: 'Solo',
    tagline:
      'Encuentra compañeros de entrenamiento que se adapten a tu horario y metas. Únete a sesiones grupales o crea las tuyas.',
    getStarted: 'Comenzar',
    googlePlay: 'Google Play',
    appStore: 'App Store',
    howItWorks: 'Cómo Funciona',
    howSubtitle: 'Tres simples pasos para encontrar tu grupo de entrenamiento',
    step1: 'Explora Sesiones',
    step1desc: 'Explora sesiones de entrenamiento cerca de ti, filtradas por deporte, nivel y horario.',
    step2: 'Únete o Crea',
    step2desc: 'Solicita unirte a una sesión o crea la tuya y deja que otros te encuentren.',
    step3: 'Entrena Juntos',
    step3desc: 'Reúnete, motívense mutuamente y construye tu comunidad fitness.',
    stopTraining: 'Deja de Entrenar Solo',
    stopSubtitle: 'Únete a cientos de atletas que ya encontraron sus compañeros de entrenamiento en Tribe.',
    signUpFree: 'Regístrate Gratis',
    about: 'Acerca de',
    contact: 'Contacto',
    instagram: 'Instagram',
    copyright: '© 2025 Tribe. Nunca entrenes solo.',
    crossfit: 'CrossFit',
    yoga: 'Yoga Flow',
    group: 'Entrenamiento Grupal',
    running: 'Trail Running',
  },
} as const;

const IMAGES = {
  main: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&h=1200&fit=crop&q=80',
  yoga: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400&h=400&fit=crop&q=80',
  group: 'https://images.unsplash.com/photo-1549060279-7e168fcee0c2?w=400&h=400&fit=crop&q=80',
  running: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=400&h=400&fit=crop&q=80',
};

const PLAY_STORE = 'https://play.google.com/store/apps/details?id=prod.tribe.android';
const APP_STORE = 'https://apps.apple.com/app/tribe-never-train-alone/id6742842816';

const steps = [
  { icon: '🔍', num: '01' },
  { icon: '🤝', num: '02' },
  { icon: '💪', num: '03' },
] as const;

export default function LandingPage(): JSX.Element {
  const { language } = useLanguage();
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
        <div className="tl-hero-glow" />
        <div className="tl-container tl-hero-grid">
          <div className="tl-hero-text">
            <div className="tl-logo">
              Tribe<span className="tl-dot">.</span>
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
              <a href={PLAY_STORE} target="_blank" rel="noopener noreferrer" className="tl-btn tl-btn-outline">
                <svg width="18" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3.61 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734c0-.382.218-.718.61-.92zM14.852 13.06l2.71 2.71-11.378 6.39 8.668-9.1zM21.41 10.89l-3.27 1.838-2.98-2.98 2.98-2.98 3.27 1.838c.93.522.93 1.762 0 2.284zM6.184 2.84l11.378 6.39-2.71 2.71-8.668-9.1z" />
                </svg>
                {s.googlePlay}
              </a>
              <a href={APP_STORE} target="_blank" rel="noopener noreferrer" className="tl-btn tl-btn-outline">
                <svg width="16" height="20" viewBox="0 0 16 20" fill="currentColor">
                  <path d="M13.3 10.5c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3.1-1.7-1.3-.1-2.6.8-3.2.8-.7 0-1.7-.8-2.8-.7-1.4 0-2.8.8-3.5 2.1-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.6 2.2 2.7 2.2 1.1 0 1.5-.7 2.8-.7 1.3 0 1.7.7 2.8.7 1.2 0 2-1 2.7-2.1.9-1.2 1.2-2.4 1.2-2.5-.1 0-2.5-1-2.5-3.5zM10.9 3.8c.6-.7 1-1.7.9-2.8-.9 0-1.9.6-2.6 1.4-.6.7-1.1 1.7-.9 2.7.9.1 1.9-.5 2.6-1.3z" />
                </svg>
                {s.appStore}
              </a>
            </div>
          </div>
          <div className="tl-hero-visual">
            <div className="tl-photo-grid">
              <div className="tl-main-card">
                <img src={IMAGES.main} alt="CrossFit training" />
                <div className="tl-main-overlay">
                  <span className="tl-badge">{s.crossfit}</span>
                </div>
              </div>
              <div className="tl-float-card tl-float-1">
                <img src={IMAGES.yoga} alt={s.yoga} />
                <span className="tl-float-label">{s.yoga}</span>
              </div>
              <div className="tl-float-card tl-float-2">
                <img src={IMAGES.group} alt={s.group} />
                <span className="tl-float-label">{s.group}</span>
              </div>
              <div className="tl-float-card tl-float-3">
                <img src={IMAGES.running} alt={s.running} />
                <span className="tl-float-label">{s.running}</span>
              </div>
              <div className="tl-emoji tl-emoji-1">🔥</div>
              <div className="tl-emoji tl-emoji-2">💪</div>
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
                <div className="tl-step-num">{steps[i].num}</div>
                <div className="tl-step-icon">{steps[i].icon}</div>
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
            <a href={PLAY_STORE} target="_blank" rel="noopener noreferrer" className="tl-btn tl-btn-outline">
              <svg width="18" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3.61 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734c0-.382.218-.718.61-.92zM14.852 13.06l2.71 2.71-11.378 6.39 8.668-9.1zM21.41 10.89l-3.27 1.838-2.98-2.98 2.98-2.98 3.27 1.838c.93.522.93 1.762 0 2.284zM6.184 2.84l11.378 6.39-2.71 2.71-8.668-9.1z" />
              </svg>
              {s.googlePlay}
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="tl-footer">
        <div className="tl-container tl-footer-inner">
          <div className="tl-footer-brand">
            Tribe<span className="tl-dot">.</span>
          </div>
          <div className="tl-footer-links">
            <a href="#">{s.about}</a>
            <a href="mailto:hello@tribesports.app">{s.contact}</a>
            <a href="https://instagram.com/tribe" target="_blank" rel="noopener noreferrer">
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
  font-family: 'Archivo Black', sans-serif;
  font-size: 28px;
  letter-spacing: -0.5px;
  margin-bottom: 32px;
}
.tribe-landing .tl-dot { color: #C0E863; }
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
.tribe-landing .tl-btn-outline {
  background: transparent;
  color: #fff;
  border: 1.5px solid rgba(255,255,255,0.25);
}
.tribe-landing .tl-btn-outline:hover { border-color: rgba(255,255,255,0.5); }

/* ─── Photo Grid ─── */
.tribe-landing .tl-hero-visual {
  animation: tlFadeIn 1s 0.4s ease-out both;
}
.tribe-landing .tl-photo-grid {
  position: relative;
  width: 100%;
  max-width: 480px;
  aspect-ratio: 3/4;
  margin: 0 auto;
}
.tribe-landing .tl-main-card {
  position: relative;
  width: 72%;
  height: 85%;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,0.4);
  margin: 0 auto;
}
.tribe-landing .tl-main-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 20px;
  background: linear-gradient(transparent, rgba(0,0,0,0.7));
}
.tribe-landing .tl-badge {
  background: #C0E863;
  color: #1a1f25;
  font-weight: 700;
  font-size: 12px;
  padding: 5px 12px;
  border-radius: 20px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.tribe-landing .tl-float-card {
  position: absolute;
  width: 110px;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0,0,0,0.35);
  animation: tlFloat 4s ease-in-out infinite;
}
.tribe-landing .tl-float-card img { height: 80px; }
.tribe-landing .tl-float-label {
  display: block;
  background: #272D34;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  padding: 6px 10px;
  text-align: center;
}
.tribe-landing .tl-float-1 { top: 5%; left: 0; animation-delay: 0s; }
.tribe-landing .tl-float-2 { bottom: 18%; left: -5%; animation-delay: 1.3s; }
.tribe-landing .tl-float-3 { top: 15%; right: 0; animation-delay: 2.6s; }

.tribe-landing .tl-emoji {
  position: absolute;
  font-size: 28px;
  animation: tlPulseEmoji 2s ease-in-out infinite;
  filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3));
}
.tribe-landing .tl-emoji-1 { bottom: 10%; right: 5%; animation-delay: 0.5s; }
.tribe-landing .tl-emoji-2 { top: 0; right: 20%; animation-delay: 1.5s; }

/* ─── How It Works ─── */
.tribe-landing .tl-how {
  background: #fff;
  color: #272D34;
  padding: 100px 0;
}
.tribe-landing .tl-section-title {
  font-family: 'Archivo Black', sans-serif;
  font-size: clamp(28px, 4vw, 42px);
  text-align: center;
  letter-spacing: -1px;
  margin-bottom: 12px;
}
.tribe-landing .tl-section-sub {
  text-align: center;
  color: #7F8C8D;
  font-size: 17px;
  margin-bottom: 64px;
}
.tribe-landing .tl-steps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 40px;
}
.tribe-landing .tl-step {
  position: relative;
  text-align: center;
  padding: 40px 24px;
  border-radius: 20px;
  background: #f8f9fa;
  overflow: hidden;
  transition: transform 0.3s, box-shadow 0.3s;
}
.tribe-landing .tl-step:hover {
  transform: translateY(-6px);
  box-shadow: 0 12px 40px rgba(0,0,0,0.08);
}
.tribe-landing .tl-step-num {
  position: absolute;
  top: -10px;
  right: 16px;
  font-family: 'Archivo Black', sans-serif;
  font-size: 100px;
  color: rgba(192,232,99,0.12);
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
}
.tribe-landing .tl-step-desc {
  font-size: 15px;
  line-height: 1.6;
  color: #7F8C8D;
}

/* ─── Final CTA ─── */
.tribe-landing .tl-final {
  position: relative;
  background: #272D34;
  padding: 100px 0;
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
.tribe-landing .tl-footer-brand {
  font-family: 'Archivo Black', sans-serif;
  font-size: 22px;
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

/* ─── Animations ─── */
@keyframes tlSlideUp {
  from { opacity: 0; transform: translateY(30px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes tlFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes tlFloat {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-10px); }
}
@keyframes tlPulseEmoji {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.15); }
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
  .tribe-landing .tl-hero-visual { order: -1; }
  .tribe-landing .tl-photo-grid { max-width: 380px; }
  .tribe-landing .tl-hero-text { text-align: center; }
  .tribe-landing .tl-tagline { margin-left: auto; margin-right: auto; }
  .tribe-landing .tl-cta-row { justify-content: center; }
  .tribe-landing .tl-steps { grid-template-columns: 1fr; max-width: 440px; margin: 0 auto; }
}

/* ─── Responsive: Mobile ─── */
@media (max-width: 768px) {
  .tribe-landing .tl-hero { padding: 72px 0 56px; }
  .tribe-landing .tl-hero-grid { gap: 36px; }
  .tribe-landing .tl-logo { font-size: 22px; margin-bottom: 24px; }
  .tribe-landing .tl-tagline { font-size: 16px; }
  .tribe-landing .tl-cta-row { flex-direction: column; align-items: center; }
  .tribe-landing .tl-btn { width: 100%; max-width: 300px; justify-content: center; }
  .tribe-landing .tl-photo-grid { max-width: 300px; }
  .tribe-landing .tl-float-card { width: 88px; }
  .tribe-landing .tl-float-card img { height: 64px; }
  .tribe-landing .tl-float-label { font-size: 10px; padding: 4px 8px; }
  .tribe-landing .tl-how { padding: 64px 0; }
  .tribe-landing .tl-section-sub { font-size: 15px; margin-bottom: 40px; }
  .tribe-landing .tl-step { padding: 32px 20px; }
  .tribe-landing .tl-final { padding: 64px 0; }
  .tribe-landing .tl-final-sub { font-size: 15px; }
}
`;
