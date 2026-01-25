const puppeteer = require('puppeteer');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

// App Store dimensions for iPhone 6.5"
const WIDTH = 1284;
const HEIGHT = 2778;

// Brand colors
const COLORS = {
  background: '#2D3748',
  accent: '#C0E863',
  white: '#FFFFFF',
  black: '#000000',
};

// Output directories
const OUTPUT_DIR = path.join(process.env.HOME, 'Desktop', 'app-store-assets');
const TEMP_DIR = path.join(OUTPUT_DIR, 'temp-captures');

// iPhone dimensions for screenshot (mobile viewport)
const PHONE_WIDTH = 390;
const PHONE_HEIGHT = 844;

// Login credentials
const CREDENTIALS = {
  email: 'alainalisca@aplusfitnessllc.com',
  password: 'Darian09!',
};

// Screenshot configurations (captured after login)
const SCREENSHOTS = [
  {
    name: 'screenshot-1-home',
    headline: 'Find Sessions\nNear You',
    path: '/',
    waitFor: 2000,
  },
  {
    name: 'screenshot-2-session',
    headline: 'Join Training\nPartners',
    path: 'SESSION_DETAIL', // Will navigate to first session
    waitFor: 2000,
  },
  {
    name: 'screenshot-3-create',
    headline: 'Host Your Own\nWorkouts',
    path: '/create',
    waitFor: 2000,
  },
  {
    name: 'screenshot-4-filters',
    headline: 'Filter by Sport\n& Skill Level',
    path: '/',
    waitFor: 1500,
    action: 'showFilters',
  },
  {
    name: 'screenshot-5-profile',
    headline: 'Build Your\nAthlete Profile',
    path: '/profile',
    waitFor: 2000,
  },
];

// Ensure directories exist
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Helper to draw rounded rectangles
function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// Draw iPhone 14 Pro style frame
function drawIPhoneFrame(ctx, x, y, frameWidth, frameHeight, screenshot) {
  const cornerRadius = frameWidth * 0.12;
  const bezelWidth = frameWidth * 0.025;

  // Phone outer frame (black)
  ctx.fillStyle = COLORS.black;
  roundRect(ctx, x, y, frameWidth, frameHeight, cornerRadius);
  ctx.fill();

  // Screen area
  const screenX = x + bezelWidth;
  const screenY = y + bezelWidth;
  const screenWidth = frameWidth - bezelWidth * 2;
  const screenHeight = frameHeight - bezelWidth * 2;
  const screenRadius = cornerRadius - bezelWidth;

  // Clip to screen area
  ctx.save();
  roundRect(ctx, screenX, screenY, screenWidth, screenHeight, screenRadius);
  ctx.clip();

  // Draw the screenshot
  if (screenshot) {
    ctx.drawImage(screenshot, screenX, screenY, screenWidth, screenHeight);
  }

  ctx.restore();

  // Dynamic Island
  const islandWidth = frameWidth * 0.28;
  const islandHeight = frameHeight * 0.022;
  const islandX = x + (frameWidth - islandWidth) / 2;
  const islandY = y + bezelWidth + frameHeight * 0.012;

  ctx.fillStyle = COLORS.black;
  roundRect(ctx, islandX, islandY, islandWidth, islandHeight, islandHeight / 2);
  ctx.fill();

  // Subtle frame highlight
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, frameWidth, frameHeight, cornerRadius);
  ctx.stroke();
}

// Draw "Tribe." logo
function drawTribeLogo(ctx, centerX, y, size) {
  ctx.fillStyle = COLORS.white;
  ctx.font = `bold ${size}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const text = 'Tribe';
  ctx.fillText(text, centerX - size * 0.15, y);

  // Green dot
  ctx.fillStyle = COLORS.accent;
  ctx.beginPath();
  const dotX = centerX + ctx.measureText(text).width / 2 + size * 0.1;
  ctx.arc(dotX, y + size * 0.15, size * 0.12, 0, Math.PI * 2);
  ctx.fill();
}

async function dismissModals(page) {
  // Try to dismiss any modals that might appear
  const modalSelectors = [
    'button:has-text("Maybe later")',
    'button:has-text("Next")',
    'button:has-text("Skip")',
    'button:has-text("Close")',
    '[aria-label="Close"]',
    '.modal-close',
    'button svg', // X buttons
  ];

  for (const selector of modalSelectors) {
    try {
      const elements = await page.$$(selector);
      for (const el of elements) {
        const isVisible = await el.isIntersectingViewport();
        if (isVisible) {
          await el.click();
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
    } catch (e) {
      // Ignore errors
    }
  }

  // Also try clicking any X buttons in modals
  try {
    const closeButtons = await page.$$('button');
    for (const btn of closeButtons) {
      const text = await btn.evaluate(el => el.textContent);
      if (text && (text.includes('×') || text.includes('✕') || text === 'X')) {
        await btn.click();
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
  } catch (e) {
    // Ignore
  }

  // Click outside modals to dismiss them
  try {
    await page.mouse.click(10, 10);
    await new Promise(resolve => setTimeout(resolve, 200));
  } catch (e) {
    // Ignore
  }
}

async function login(page) {
  console.log('Logging in...');

  // Go to auth page
  await page.goto('https://tribe-v3.vercel.app/auth', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Fill in email
  const emailInput = await page.$('input[type="email"]');
  if (emailInput) {
    await emailInput.click({ clickCount: 3 });
    await emailInput.type(CREDENTIALS.email);
  }

  // Fill in password
  const passwordInput = await page.$('input[type="password"]');
  if (passwordInput) {
    await passwordInput.click({ clickCount: 3 });
    await passwordInput.type(CREDENTIALS.password);
  }

  await new Promise(resolve => setTimeout(resolve, 500));

  // Click sign in button
  const signInButton = await page.$('button[type="submit"]');
  if (signInButton) {
    await signInButton.click();
  }

  // Wait for navigation/login to complete
  console.log('Waiting for login to complete...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Dismiss any onboarding modals
  console.log('Dismissing modals...');
  await dismissModals(page);
  await new Promise(resolve => setTimeout(resolve, 1000));
  await dismissModals(page);

  // Check if we're logged in
  const currentUrl = page.url();
  console.log(`Current URL after login: ${currentUrl}`);

  return true;
}

async function captureScreenshots() {
  console.log('Launching browser...\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  // Set mobile viewport
  await page.setViewport({
    width: PHONE_WIDTH,
    height: PHONE_HEIGHT,
    deviceScaleFactor: 2,
  });

  // Set mobile user agent
  await page.setUserAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
  );

  // Login first
  await login(page);

  const capturedPaths = [];
  let sessionDetailUrl = null;

  for (const config of SCREENSHOTS) {
    console.log(`\nCapturing: ${config.name}`);

    try {
      let targetUrl;

      if (config.path === 'SESSION_DETAIL') {
        // Navigate to home first and find a session to click
        await page.goto('https://tribe-v3.vercel.app/', { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 2000));
        await dismissModals(page);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Try to find and click on a session card/link
        const sessionLink = await page.$('a[href^="/session/"]');
        if (sessionLink) {
          const href = await sessionLink.evaluate(el => el.getAttribute('href'));
          console.log(`  Found session link: ${href}`);
          await page.goto(`https://tribe-v3.vercel.app${href}`, { waitUntil: 'networkidle2', timeout: 30000 });
          await new Promise(resolve => setTimeout(resolve, 3000));
          await dismissModals(page);
          sessionDetailUrl = page.url();
          console.log(`  Navigated to session: ${sessionDetailUrl}`);
        } else {
          // Try clicking View Details button
          const viewBtn = await page.$('button:has-text("View")');
          if (viewBtn) {
            await viewBtn.click();
            await new Promise(resolve => setTimeout(resolve, 3000));
            await dismissModals(page);
          } else {
            console.log('  No session found, using home page');
          }
        }
      } else {
        targetUrl = `https://tribe-v3.vercel.app${config.path}`;
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, config.waitFor));

        // Dismiss any modals that appear
        await dismissModals(page);
        await new Promise(resolve => setTimeout(resolve, 500));
        await dismissModals(page);
      }

      // Handle special actions
      if (config.action === 'showFilters') {
        await page.evaluate(() => window.scrollTo(0, 0));
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Final modal check
      await dismissModals(page);
      await new Promise(resolve => setTimeout(resolve, 300));

      const screenshotPath = path.join(TEMP_DIR, `${config.name}.png`);
      await page.screenshot({ path: screenshotPath, type: 'png' });

      capturedPaths.push({ ...config, path: screenshotPath });
      console.log(`  ✓ Saved to ${screenshotPath}`);
    } catch (error) {
      console.error(`  ✗ Failed: ${error.message}`);
      capturedPaths.push({ ...config, path: null });
    }
  }

  await browser.close();
  console.log('\nBrowser closed.\n');

  return capturedPaths;
}

async function createAppStoreScreenshot(config) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // --- TOP SECTION: Headlines ---
  const topPadding = 100;
  const headlineY = topPadding + 80;

  // Draw headline text
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 90px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const lines = config.headline.split('\n');
  const lineHeight = 110;

  lines.forEach((line, i) => {
    ctx.fillText(line, WIDTH / 2, headlineY + i * lineHeight);
  });

  // Accent underline
  const underlineY = headlineY + lines.length * lineHeight + 30;
  const underlineWidth = 280;
  ctx.fillStyle = COLORS.accent;
  roundRect(ctx, WIDTH / 2 - underlineWidth / 2, underlineY, underlineWidth, 10, 5);
  ctx.fill();

  // --- MIDDLE SECTION: iPhone with screenshot ---
  const phoneAreaTop = underlineY + 80;
  const phoneAreaBottom = HEIGHT - 180;
  const phoneAreaHeight = phoneAreaBottom - phoneAreaTop;

  // Calculate phone dimensions
  const phoneAspectRatio = PHONE_WIDTH / PHONE_HEIGHT;
  let phoneHeight = phoneAreaHeight * 0.92;
  let phoneWidth = phoneHeight * phoneAspectRatio;

  if (phoneWidth > WIDTH * 0.75) {
    phoneWidth = WIDTH * 0.75;
    phoneHeight = phoneWidth / phoneAspectRatio;
  }

  const phoneX = (WIDTH - phoneWidth) / 2;
  const phoneY = phoneAreaTop + (phoneAreaHeight - phoneHeight) / 2;

  // Load screenshot image
  let screenshotImg = null;
  if (config.path && fs.existsSync(config.path)) {
    try {
      screenshotImg = await loadImage(config.path);
    } catch (e) {
      console.error(`  Could not load screenshot: ${e.message}`);
    }
  }

  // Draw the iPhone frame with screenshot
  drawIPhoneFrame(ctx, phoneX, phoneY, phoneWidth, phoneHeight, screenshotImg);

  // --- BOTTOM SECTION: Tribe logo ---
  const logoY = HEIGHT - 90;
  drawTribeLogo(ctx, WIDTH / 2, logoY, 50);

  // Save the final image
  const outputPath = path.join(OUTPUT_DIR, `${config.name}.png`);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);

  console.log(`Created: ${config.name}.png`);
  return outputPath;
}

async function main() {
  console.log('='.repeat(50));
  console.log('iOS App Store Screenshot Generator v3');
  console.log('(With Authentication)');
  console.log('='.repeat(50));
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Size: ${WIDTH} x ${HEIGHT} px\n`);

  // Step 1: Capture live screenshots (with login)
  console.log('STEP 1: Logging in and capturing screenshots...\n');
  const captures = await captureScreenshots();

  // Step 2: Create App Store screenshots
  console.log('STEP 2: Creating App Store screenshots...\n');

  for (const config of captures) {
    await createAppStoreScreenshot(config);
  }

  // Cleanup temp files
  console.log('\nCleaning up temp files...');
  for (const file of fs.readdirSync(TEMP_DIR)) {
    fs.unlinkSync(path.join(TEMP_DIR, file));
  }
  fs.rmdirSync(TEMP_DIR);

  console.log('\n' + '='.repeat(50));
  console.log('All screenshots generated successfully!');
  console.log('='.repeat(50));
}

main().catch(console.error);
