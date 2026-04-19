# Tribe Landing Page - CrossFit Version - Ready to Implement

## What You're Getting

**Main image:** CrossFit athlete lifting
**Floating cards:** Yoga, group training, running
**Session preview:** "CROSSFIT - Morning WOD Session"

---

## File 1: `/pages/index.tsx`

```typescript
import Head from 'next/head'
import Image from 'next/image'

export default function LandingPage() {
  return (
    <>
      <Head>
        <title>Tribe - Never Train Alone</title>
        <meta name="description" content="Find workout partners who match your schedule and goals. Join group sessions or create your own." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>

      <div className="landing-page">
        {/* Hero Section */}
        <section className="hero">
          <div className="hero-container">
            <div className="hero-left">
              <div className="logo">
                Tribe<span className="logo-dot">.</span>
              </div>
              
              <h1>
                Never Train<br />
                <span className="hero-highlight">Alone</span>
              </h1>
              
              <p className="hero-tagline">
                Find workout partners who match your schedule and goals. Join group sessions or create your own.
              </p>
              
              <div className="cta-buttons">
                <a href="https://apps.apple.com/app/tribe" className="btn btn-primary">
                  <span>Download for iOS</span>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M5 10L10 15L15 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M10 3V15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                  </svg>
                </a>
                <a href="https://play.google.com/store/apps/details?id=com.tribe" className="btn btn-secondary">
                  <span>Download for Android</span>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M5 10L10 15L15 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M10 3V15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                  </svg>
                </a>
              </div>
            </div>

            <div className="hero-visual">
              <div className="visual-container">
                <div className="photo-grid">
                  <div className="main-card">
                    <div className="main-photo">
                      <img 
                        src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&h=1200&fit=crop&q=80" 
                        alt="CrossFit workout"
                      />
                      <div className="photo-overlay">
                        <div className="overlay-sport">CROSSFIT</div>
                        <div className="overlay-title">Morning WOD Session</div>
                        <div className="overlay-meta">Tomorrow at 6:00 AM • 5 people joined</div>
                      </div>
                    </div>
                  </div>

                  <div className="floating-card card-1">
                    <img 
                      src="https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400&h=400&fit=crop&q=80"
                      alt="Yoga"
                    />
                  </div>

                  <div className="floating-card card-2">
                    <img 
                      src="https://images.unsplash.com/photo-1549060279-7e168fcee0c2?w=400&h=400&fit=crop&q=80"
                      alt="Group training"
                    />
                  </div>

                  <div className="floating-card card-3">
                    <img 
                      src="https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=400&h=400&fit=crop&q=80"
                      alt="Running"
                    />
                  </div>

                  <div className="reaction reaction-1">💪</div>
                  <div className="reaction reaction-2">🔥</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="how-it-works">
          <div className="container">
            <h2 className="section-title">How It Works</h2>
            <p className="section-subtitle">
              Three simple steps to find your training crew
            </p>
            
            <div className="steps">
              <div className="step">
                <div className="step-number">1</div>
                <h3>Browse Sessions</h3>
                <p>
                  See upcoming workouts across all sports. Early morning CrossFit. Lunchtime runs. Evening BJJ. Find what fits your schedule.
                </p>
              </div>
              
              <div className="step">
                <div className="step-number">2</div>
                <h3>Join or Create</h3>
                <p>
                  Join an existing session or create your own. Set the time, location, and sport. Let people know when you're training.
                </p>
              </div>
              
              <div className="step">
                <div className="step-number">3</div>
                <h3>Train Together</h3>
                <p>
                  Chat with your crew. Coordinate details. Show up and train together. Build your fitness community one workout at a time.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="final-cta">
          <div className="final-cta-content">
            <h2>Stop Training<br />Alone</h2>
            <div className="cta-buttons">
              <a href="https://apps.apple.com/app/tribe" className="btn btn-primary">
                <span>Download for iOS</span>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M5 10L10 15L15 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M10 3V15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>
              </a>
              <a href="https://play.google.com/store/apps/details?id=com.tribe" className="btn btn-secondary">
                <span>Download for Android</span>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M5 10L10 15L15 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M10 3V15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>
              </a>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="footer">
          <div className="footer-links">
            <a href="#about">About</a>
            <a href="mailto:hello@tribe.app">Contact</a>
            <a href="https://instagram.com/tribe" target="_blank" rel="noopener noreferrer">Instagram</a>
          </div>
          <p>&copy; 2025 Tribe. Never train alone.</p>
        </footer>
      </div>

      <style jsx global>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        :root {
          --dark: #2C3E50;
          --white: #FFFFFF;
          --lime: #A4D65E;
          --gray: #7F8C8D;
        }

        body {
          font-family: 'Inter', -apple-system, sans-serif;
          background: var(--white);
          color: var(--dark);
          line-height: 1.6;
          overflow-x: hidden;
        }

        .landing-page .hero {
          min-height: 100vh;
          background: var(--dark);
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          padding: 60px 40px;
        }

        .landing-page .hero::before {
          content: '';
          position: absolute;
          top: -30%;
          right: -20%;
          width: 1200px;
          height: 1200px;
          background: radial-gradient(circle, rgba(164, 214, 94, 0.12) 0%, transparent 70%);
          animation: pulseGlow 10s ease-in-out infinite;
        }

        @keyframes pulseGlow {
          0%, 100% { transform: scale(1) rotate(0deg); opacity: 0.3; }
          50% { transform: scale(1.15) rotate(5deg); opacity: 0.5; }
        }

        .landing-page .hero-container {
          max-width: 1400px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 100px;
          align-items: center;
          position: relative;
          z-index: 10;
        }

        .landing-page .hero-left {
          animation: slideUp 0.8s ease-out;
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .landing-page .logo {
          font-family: 'Archivo Black', sans-serif;
          font-size: 42px;
          color: var(--white);
          margin-bottom: 60px;
          letter-spacing: -2px;
        }

        .landing-page .logo-dot {
          color: var(--lime);
        }

        .landing-page .hero h1 {
          font-family: 'Archivo Black', sans-serif;
          font-size: clamp(52px, 7vw, 84px);
          color: var(--white);
          line-height: 1.05;
          margin-bottom: 28px;
          letter-spacing: -3px;
        }

        .landing-page .hero-highlight {
          color: var(--lime);
          display: block;
        }

        .landing-page .hero-tagline {
          font-size: 24px;
          color: rgba(255, 255, 255, 0.85);
          margin-bottom: 48px;
          font-weight: 400;
          line-height: 1.5;
          max-width: 540px;
        }

        .landing-page .cta-buttons {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .landing-page .btn {
          padding: 20px 40px;
          font-size: 18px;
          font-weight: 700;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          font-family: 'Inter', sans-serif;
        }

        .landing-page .btn-primary {
          background: var(--lime);
          color: var(--dark);
          box-shadow: 0 4px 14px rgba(164, 214, 94, 0.3);
        }

        .landing-page .btn-primary:hover {
          background: #95C74E;
          transform: translateY(-3px);
          box-shadow: 0 8px 24px rgba(164, 214, 94, 0.4);
        }

        .landing-page .btn-secondary {
          background: transparent;
          color: var(--white);
          border: 2.5px solid rgba(255, 255, 255, 0.3);
        }

        .landing-page .btn-secondary:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: var(--white);
          transform: translateY(-3px);
        }

        .landing-page .hero-visual {
          position: relative;
          animation: fadeIn 1s ease-out 0.3s backwards;
        }

        @keyframes fadeIn {
          from { opacity: 0; scale: 0.95; }
          to { opacity: 1; scale: 1; }
        }

        .landing-page .visual-container {
          position: relative;
          width: 100%;
          max-width: 600px;
          margin: 0 auto;
        }

        .landing-page .photo-grid {
          position: relative;
          transform: rotate(-3deg);
        }

        .landing-page .main-card {
          background: white;
          border-radius: 24px;
          padding: 8px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          position: relative;
          z-index: 3;
        }

        .landing-page .main-photo {
          width: 100%;
          aspect-ratio: 3/4;
          border-radius: 18px;
          overflow: hidden;
          position: relative;
        }

        .landing-page .main-photo img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .landing-page .photo-overlay {
          position: absolute;
          bottom: 20px;
          left: 20px;
          right: 20px;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(20px);
          padding: 16px 20px;
          border-radius: 16px;
          color: white;
        }

        .landing-page .overlay-sport {
          font-size: 14px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: var(--lime);
          margin-bottom: 4px;
        }

        .landing-page .overlay-title {
          font-size: 20px;
          font-weight: 800;
          margin-bottom: 6px;
        }

        .landing-page .overlay-meta {
          font-size: 13px;
          opacity: 0.85;
        }

        .landing-page .floating-card {
          position: absolute;
          background: white;
          border-radius: 16px;
          padding: 6px;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
          animation: float 6s ease-in-out infinite;
        }

        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-15px) rotate(2deg); }
        }

        .landing-page .floating-card img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 12px;
          display: block;
        }

        .landing-page .card-1 {
          width: 140px;
          aspect-ratio: 1;
          top: -30px;
          left: -50px;
          animation-delay: 0s;
          z-index: 2;
        }

        .landing-page .card-2 {
          width: 120px;
          aspect-ratio: 1;
          top: 40%;
          right: -40px;
          animation-delay: 1s;
          z-index: 4;
        }

        .landing-page .card-3 {
          width: 110px;
          aspect-ratio: 1;
          bottom: -20px;
          left: -30px;
          animation-delay: 2s;
          z-index: 2;
        }

        .landing-page .reaction {
          position: absolute;
          width: 56px;
          height: 56px;
          background: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
          animation: pulse 3s ease-in-out infinite;
          z-index: 5;
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }

        .landing-page .reaction-1 {
          top: 10%;
          right: -20px;
          animation-delay: 0.5s;
        }

        .landing-page .reaction-2 {
          bottom: 15%;
          right: -10px;
          animation-delay: 1.5s;
        }

        .landing-page .how-it-works {
          padding: 140px 40px;
          background: var(--white);
        }

        .landing-page .container {
          max-width: 1200px;
          margin: 0 auto;
          text-align: center;
        }

        .landing-page .section-title {
          font-family: 'Archivo Black', sans-serif;
          font-size: clamp(40px, 5vw, 64px);
          color: var(--dark);
          margin-bottom: 20px;
          letter-spacing: -2px;
        }

        .landing-page .section-subtitle {
          font-size: 22px;
          color: var(--gray);
          margin-bottom: 80px;
          max-width: 700px;
          margin-left: auto;
          margin-right: auto;
        }

        .landing-page .steps {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 60px;
          text-align: left;
        }

        .landing-page .step {
          position: relative;
        }

        .landing-page .step-number {
          font-family: 'Archivo Black', sans-serif;
          font-size: 140px;
          color: var(--lime);
          opacity: 0.12;
          line-height: 1;
          margin-bottom: -50px;
          font-weight: 900;
        }

        .landing-page .step h3 {
          font-family: 'Archivo Black', sans-serif;
          font-size: 32px;
          color: var(--dark);
          margin-bottom: 16px;
          letter-spacing: -1px;
        }

        .landing-page .step p {
          font-size: 18px;
          color: var(--gray);
          line-height: 1.7;
        }

        .landing-page .final-cta {
          padding: 160px 40px;
          background: var(--dark);
          text-align: center;
          position: relative;
          overflow: hidden;
        }

        .landing-page .final-cta::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 1200px;
          height: 1200px;
          background: radial-gradient(circle, rgba(164, 214, 94, 0.08) 0%, transparent 70%);
        }

        .landing-page .final-cta-content {
          position: relative;
          z-index: 10;
        }

        .landing-page .final-cta h2 {
          font-family: 'Archivo Black', sans-serif;
          font-size: clamp(44px, 6vw, 76px);
          color: var(--white);
          margin-bottom: 60px;
          letter-spacing: -2px;
          line-height: 1.1;
        }

        .landing-page .footer {
          padding: 50px 40px;
          background: #1a1a1a;
          color: var(--white);
          text-align: center;
        }

        .landing-page .footer-links {
          display: flex;
          gap: 40px;
          justify-content: center;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }

        .landing-page .footer-links a {
          color: rgba(255, 255, 255, 0.6);
          text-decoration: none;
          font-size: 15px;
          font-weight: 500;
          transition: color 0.3s ease;
        }

        .landing-page .footer-links a:hover {
          color: var(--lime);
        }

        .landing-page .footer p {
          color: rgba(255, 255, 255, 0.4);
          font-size: 14px;
        }

        @media (max-width: 1024px) {
          .landing-page .hero-container {
            grid-template-columns: 1fr;
            gap: 60px;
          }

          .landing-page .hero-visual {
            order: -1;
          }

          .landing-page .visual-container {
            max-width: 450px;
          }

          .landing-page .steps {
            grid-template-columns: 1fr;
            gap: 60px;
          }
        }

        @media (max-width: 768px) {
          .landing-page .hero {
            padding: 40px 24px;
          }

          .landing-page .logo {
            font-size: 32px;
            margin-bottom: 40px;
          }

          .landing-page .hero-tagline {
            font-size: 19px;
          }

          .landing-page .cta-buttons {
            flex-direction: column;
          }

          .landing-page .btn {
            width: 100%;
            justify-content: center;
          }

          .landing-page .visual-container {
            max-width: 340px;
          }

          .landing-page .card-1 { width: 100px; left: -30px; }
          .landing-page .card-2 { width: 90px; right: -20px; }
          .landing-page .card-3 { width: 85px; }

          .landing-page .reaction {
            width: 44px;
            height: 44px;
            font-size: 22px;
          }

          .landing-page .how-it-works {
            padding: 100px 24px;
          }

          .landing-page .final-cta {
            padding: 100px 24px;
          }

          .landing-page .step-number {
            font-size: 100px;
          }
        }

        html {
          scroll-behavior: smooth;
        }
      `}</style>
    </>
  )
}
```

---

## File 2: `next.config.js` (Update)

Add this to allow Unsplash images:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['images.unsplash.com'],
  },
}

module.exports = nextConfig
```

---

## What to Do in Dev Chat

**Copy/paste this:**

"I need to add this landing page to my Tribe Next.js app.

**Files:**
1. Create `/pages/index.tsx` with the code above
2. Update `next.config.js` to allow Unsplash images

**Test locally:**
- `npm run dev`
- Visit `localhost:3000` (should show landing page)
- Visit `localhost:3000/app` (should show existing app)

**After testing:**
- Deploy to Vercel
- Buy tribe.app domain
- Configure DNS

Let's start with creating the index.tsx file."

---

**That's it. You're ready to go.** ✅
