const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(process.env.HOME, 'Desktop', 'play-store-assets');
const LOGO_PATH = path.join(__dirname, '..', 'public', 'app-logo.png');

// Brand colors
const TRIBE_GREEN = '#C0E863';
const TRIBE_DARK = '#272D34';
const DARK_BG = '#0f172a';

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Read logo as base64
const logoBase64 = fs.readFileSync(LOGO_PATH).toString('base64');
const logoDataUrl = `data:image/png;base64,${logoBase64}`;

// Feature Graphic HTML (1024x500) - will be generated with logo
function getFeatureGraphicHTML(logoUrl) {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 1024px;
      height: 500px;
      background: linear-gradient(135deg, ${TRIBE_DARK} 0%, ${DARK_BG} 100%);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      position: relative;
    }
    .container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
    }
    .logo-img {
      width: 500px;
      height: auto;
    }
    .tagline {
      font-size: 36px;
      color: ${TRIBE_GREEN};
      font-weight: 500;
      margin-top: -10px;
    }
    /* Decorative elements */
    .circle1 {
      position: absolute;
      width: 300px;
      height: 300px;
      border-radius: 50%;
      background: rgba(192, 232, 99, 0.05);
      top: -100px;
      right: -50px;
    }
    .circle2 {
      position: absolute;
      width: 200px;
      height: 200px;
      border-radius: 50%;
      background: rgba(192, 232, 99, 0.03);
      bottom: -50px;
      left: 100px;
    }
    .people-icons {
      position: absolute;
      bottom: 30px;
      right: 60px;
      display: flex;
      gap: 8px;
    }
    .person {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(255,255,255,0.1);
      border: 2px solid rgba(255,255,255,0.2);
    }
    .person:nth-child(2) { margin-left: -15px; }
    .person:nth-child(3) { margin-left: -15px; background: ${TRIBE_GREEN}; border-color: ${TRIBE_GREEN}; }
  </style>
</head>
<body>
  <div class="circle1"></div>
  <div class="circle2"></div>
  <div class="container">
    <img src="${logoUrl}" class="logo-img" alt="Tribe" />
    <div class="tagline">Never Train Alone</div>
  </div>
  <div class="people-icons">
    <div class="person"></div>
    <div class="person"></div>
    <div class="person"></div>
  </div>
</body>
</html>
`;
}

// Screenshot frame HTML template
function createScreenshotFrameHTML(screenshotBase64, caption, logoUrl) {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 1080px;
      height: 1920px;
      background: linear-gradient(180deg, ${TRIBE_DARK} 0%, ${DARK_BG} 100%);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 60px 40px;
      overflow: hidden;
    }
    .caption {
      font-size: 52px;
      font-weight: 700;
      color: white;
      text-align: center;
      margin-bottom: 50px;
      line-height: 1.2;
    }
    .caption span {
      color: ${TRIBE_GREEN};
    }
    .phone-frame {
      width: 380px;
      height: 780px;
      background: #1a1a1a;
      border-radius: 50px;
      padding: 12px;
      box-shadow: 0 30px 80px rgba(0,0,0,0.5);
      position: relative;
    }
    .phone-screen {
      width: 100%;
      height: 100%;
      border-radius: 40px;
      overflow: hidden;
      background: white;
    }
    .phone-screen img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: top;
    }
    .notch {
      position: absolute;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      width: 150px;
      height: 30px;
      background: #1a1a1a;
      border-radius: 0 0 20px 20px;
      z-index: 10;
    }
    .dynamic-island {
      position: absolute;
      top: 22px;
      left: 50%;
      transform: translateX(-50%);
      width: 100px;
      height: 28px;
      background: #000;
      border-radius: 20px;
      z-index: 11;
    }
    .logo-bottom {
      margin-top: auto;
      display: flex;
      align-items: center;
      justify-content: center;
      padding-top: 40px;
    }
    .logo-img {
      height: 60px;
      width: auto;
    }
  </style>
</head>
<body>
  <div class="caption">${caption}</div>
  <div class="phone-frame">
    <div class="dynamic-island"></div>
    <div class="phone-screen">
      <img src="data:image/png;base64,${screenshotBase64}" alt="App Screenshot" />
    </div>
  </div>
  <div class="logo-bottom">
    <img src="${logoUrl}" class="logo-img" alt="Tribe" />
  </div>
</body>
</html>
`;
}

// Mockup screen HTML for Create Session
function createMockupHTML(type) {
  const styles = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 393px;
      height: 852px;
      background: ${TRIBE_DARK};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: white;
      overflow: hidden;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 50px 20px 15px;
      background: ${DARK_BG};
    }
    .header-title {
      font-size: 18px;
      font-weight: 600;
    }
    .lang-toggle {
      display: flex;
      gap: 5px;
    }
    .lang-btn {
      padding: 4px 10px;
      border-radius: 15px;
      font-size: 12px;
      background: transparent;
      color: #888;
    }
    .lang-btn.active {
      background: ${TRIBE_GREEN};
      color: ${TRIBE_DARK};
    }
    .content {
      padding: 20px;
      background: #f5f5f5;
      min-height: 700px;
    }
    .form-group {
      margin-bottom: 16px;
    }
    .label {
      font-size: 13px;
      color: #666;
      margin-bottom: 6px;
      display: block;
    }
    .input {
      width: 100%;
      padding: 12px 15px;
      border-radius: 12px;
      border: none;
      background: white;
      font-size: 15px;
      color: ${TRIBE_DARK};
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    .select {
      width: 100%;
      padding: 12px 15px;
      border-radius: 12px;
      border: none;
      background: white;
      font-size: 15px;
      color: ${TRIBE_DARK};
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    .chip-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .chip {
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      background: white;
      color: #666;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    .chip.active {
      background: ${TRIBE_GREEN};
      color: ${TRIBE_DARK};
      font-weight: 600;
    }
    .btn-create {
      width: 100%;
      padding: 16px;
      border-radius: 12px;
      border: none;
      background: ${TRIBE_GREEN};
      color: ${TRIBE_DARK};
      font-size: 16px;
      font-weight: 600;
      margin-top: 20px;
    }
    .nav-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      display: flex;
      justify-content: space-around;
      padding: 10px 0 25px;
      background: white;
      border-top: 1px solid #eee;
    }
    .nav-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      font-size: 10px;
      color: #888;
    }
    .nav-item.active {
      color: ${TRIBE_GREEN};
    }
    .nav-icon {
      width: 24px;
      height: 24px;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .create-btn {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background: ${TRIBE_GREEN};
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: -20px;
      color: ${TRIBE_DARK};
      font-size: 24px;
      font-weight: 300;
    }
    /* Chat styles */
    .chat-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 50px 20px 15px;
      background: ${DARK_BG};
    }
    .chat-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: ${TRIBE_GREEN};
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      color: ${TRIBE_DARK};
    }
    .chat-name {
      font-size: 16px;
      font-weight: 600;
    }
    .chat-subtitle {
      font-size: 12px;
      color: ${TRIBE_GREEN};
    }
    .chat-content {
      padding: 20px;
      background: #f5f5f5;
      min-height: 660px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .message {
      max-width: 75%;
      padding: 12px 16px;
      border-radius: 18px;
      font-size: 14px;
      line-height: 1.4;
    }
    .message.received {
      background: white;
      color: ${TRIBE_DARK};
      align-self: flex-start;
      border-bottom-left-radius: 4px;
    }
    .message.sent {
      background: ${TRIBE_GREEN};
      color: ${TRIBE_DARK};
      align-self: flex-end;
      border-bottom-right-radius: 4px;
    }
    .message-time {
      font-size: 10px;
      color: #888;
      margin-top: 4px;
    }
    .chat-input {
      position: absolute;
      bottom: 85px;
      left: 20px;
      right: 20px;
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .chat-input input {
      flex: 1;
      padding: 12px 16px;
      border-radius: 24px;
      border: none;
      background: white;
      font-size: 14px;
    }
    .send-btn {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: ${TRIBE_GREEN};
      display: flex;
      align-items: center;
      justify-content: center;
      color: ${TRIBE_DARK};
    }
  `;

  if (type === 'create') {
    return `
<!DOCTYPE html>
<html>
<head><style>${styles}</style></head>
<body>
  <div class="header">
    <span></span>
    <span class="header-title">Create Session</span>
    <div class="lang-toggle">
      <span class="lang-btn active">EN</span>
      <span class="lang-btn">ES</span>
    </div>
  </div>
  <div class="content">
    <div class="form-group">
      <span class="label">Sport</span>
      <div class="chip-row">
        <span class="chip active">Running</span>
        <span class="chip">Cycling</span>
        <span class="chip">CrossFit</span>
        <span class="chip">Yoga</span>
      </div>
    </div>
    <div class="form-group">
      <span class="label">Session Title</span>
      <input class="input" value="Morning Run at Parque Lleras" />
    </div>
    <div class="form-group">
      <span class="label">Date & Time</span>
      <input class="input" value="Tomorrow, 6:30 AM" />
    </div>
    <div class="form-group">
      <span class="label">Location</span>
      <input class="input" value="Parque Lleras, El Poblado" />
    </div>
    <div class="form-group">
      <span class="label">Max Participants</span>
      <div class="chip-row">
        <span class="chip">2</span>
        <span class="chip active">5</span>
        <span class="chip">10</span>
        <span class="chip">20</span>
      </div>
    </div>
    <div class="form-group">
      <span class="label">Skill Level</span>
      <div class="chip-row">
        <span class="chip">Beginner</span>
        <span class="chip active">Intermediate</span>
        <span class="chip">Advanced</span>
      </div>
    </div>
    <button class="btn-create">Create Session</button>
  </div>
  <div class="nav-bar">
    <div class="nav-item">
      <div class="nav-icon">🏠</div>
      Home
    </div>
    <div class="nav-item">
      <div class="nav-icon">📅</div>
      My Sessions
    </div>
    <div class="nav-item active">
      <div class="create-btn">+</div>
      Create
    </div>
    <div class="nav-item">
      <div class="nav-icon">🔔</div>
      Requests
    </div>
    <div class="nav-item">
      <div class="nav-icon">👤</div>
      Profile
    </div>
  </div>
</body>
</html>
    `;
  } else if (type === 'chat') {
    return `
<!DOCTYPE html>
<html>
<head><style>${styles}</style></head>
<body>
  <div class="chat-header">
    <div class="chat-avatar">MR</div>
    <div>
      <div class="chat-name">Morning Run Crew</div>
      <div class="chat-subtitle">5 participants</div>
    </div>
  </div>
  <div class="chat-content">
    <div class="message received">
      <div>Hey everyone! Ready for tomorrow's run? 🏃‍♂️</div>
      <div class="message-time">Maria - 2:30 PM</div>
    </div>
    <div class="message sent">
      <div>Absolutely! I'll bring water bottles for everyone 💧</div>
      <div class="message-time">You - 2:32 PM</div>
    </div>
    <div class="message received">
      <div>Perfect! Let's meet at the main entrance at 6:25 AM</div>
      <div class="message-time">Carlos - 2:35 PM</div>
    </div>
    <div class="message sent">
      <div>Sounds good! See you all there 💪</div>
      <div class="message-time">You - 2:36 PM</div>
    </div>
    <div class="message received">
      <div>Don't forget to stretch before! The route is 5K today</div>
      <div class="message-time">Maria - 2:40 PM</div>
    </div>
  </div>
  <div class="chat-input">
    <input placeholder="Type a message..." />
    <div class="send-btn">➤</div>
  </div>
  <div class="nav-bar">
    <div class="nav-item">
      <div class="nav-icon">🏠</div>
      Home
    </div>
    <div class="nav-item">
      <div class="nav-icon">📅</div>
      My Sessions
    </div>
    <div class="nav-item">
      <div class="create-btn">+</div>
      Create
    </div>
    <div class="nav-item">
      <div class="nav-icon">🔔</div>
      Requests
    </div>
    <div class="nav-item">
      <div class="nav-icon">👤</div>
      Profile
    </div>
  </div>
</body>
</html>
    `;
  }
}

// Screenshots to capture - mix of live screens and mockup screens
const screenshots = [
  {
    url: 'https://tribe-v3.vercel.app/',
    caption: 'Find <span>Sessions</span><br>Near You',
    filename: 'screenshot-1-home.png',
    waitFor: 3000,
    scrollY: 0
  },
  {
    url: 'https://tribe-v3.vercel.app/',
    caption: 'Join <span>Training</span><br>Partners',
    filename: 'screenshot-2-sessions.png',
    waitFor: 3000,
    scrollY: 200
  },
  {
    type: 'mockup',
    caption: 'Host Your Own<br><span>Workouts</span>',
    filename: 'screenshot-3-create.png',
    mockupType: 'create'
  },
  {
    type: 'mockup',
    caption: 'Connect With<br>Your <span>Crew</span>',
    filename: 'screenshot-4-chat.png',
    mockupType: 'chat'
  },
  {
    url: 'https://tribe-v3.vercel.app/',
    caption: 'Filter by <span>Sport</span><br>& Skill Level',
    filename: 'screenshot-5-filters.png',
    waitFor: 3000,
    scrollY: 0
  }
];

async function main() {
  console.log('🚀 Starting Play Store asset generation...\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    // 1. Generate Feature Graphic
    console.log('📸 Creating Feature Graphic (1024x500)...');
    const featurePage = await browser.newPage();
    await featurePage.setViewport({ width: 1024, height: 500 });
    await featurePage.setContent(getFeatureGraphicHTML(logoDataUrl));
    await featurePage.screenshot({
      path: path.join(OUTPUT_DIR, 'feature-graphic.png'),
      type: 'png'
    });
    await featurePage.close();
    console.log('✅ Feature graphic saved!\n');

    // 2. Capture App Screenshots
    console.log('📱 Capturing app screenshots...\n');

    const screenshotPage = await browser.newPage();
    // Set mobile viewport (iPhone 14 Pro dimensions)
    await screenshotPage.setViewport({
      width: 393,
      height: 852,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true
    });

    for (const shot of screenshots) {
      try {
        let rawScreenshot;

        if (shot.type === 'mockup') {
          // Create mockup screenshot
          console.log(`  📷 Creating mockup: ${shot.mockupType}`);
          const mockupPage = await browser.newPage();
          await mockupPage.setViewport({ width: 393, height: 852, deviceScaleFactor: 2 });
          await mockupPage.setContent(createMockupHTML(shot.mockupType));
          await new Promise(r => setTimeout(r, 500));
          rawScreenshot = await mockupPage.screenshot({
            type: 'png',
            encoding: 'base64'
          });
          await mockupPage.close();
        } else {
          // Capture live screenshot
          console.log(`  📷 Capturing: ${shot.url}`);
          await screenshotPage.goto(shot.url, {
            waitUntil: 'networkidle2',
            timeout: 30000
          });
          await new Promise(r => setTimeout(r, shot.waitFor));

          // Scroll if needed
          if (shot.scrollY) {
            await screenshotPage.evaluate((scrollY) => {
              window.scrollTo(0, scrollY);
            }, shot.scrollY);
            await new Promise(r => setTimeout(r, 500));
          }

          rawScreenshot = await screenshotPage.screenshot({
            type: 'png',
            encoding: 'base64'
          });
        }

        // Create framed screenshot
        const framePage = await browser.newPage();
        await framePage.setViewport({ width: 1080, height: 1920 });
        await framePage.setContent(createScreenshotFrameHTML(rawScreenshot, shot.caption, logoDataUrl));
        await framePage.screenshot({
          path: path.join(OUTPUT_DIR, shot.filename),
          type: 'png'
        });
        await framePage.close();

        console.log(`  ✅ Saved: ${shot.filename}`);
      } catch (err) {
        console.log(`  ⚠️ Could not capture ${shot.filename}: ${err.message}`);
      }
    }

    await screenshotPage.close();

    console.log('\n✨ All assets generated successfully!');
    console.log(`📁 Output directory: ${OUTPUT_DIR}`);

    // List generated files
    const files = fs.readdirSync(OUTPUT_DIR);
    console.log('\n📋 Generated files:');
    files.forEach(f => console.log(`   - ${f}`));

  } finally {
    await browser.close();
  }
}

main().catch(console.error);
