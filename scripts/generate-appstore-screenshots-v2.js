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

// Screenshot configurations
const SCREENSHOTS = [
  {
    name: 'screenshot-1-home',
    headline: 'Find Sessions\nNear You',
    url: 'https://tribe-v3.vercel.app/',
    waitFor: 3000,
    action: null,
  },
  {
    name: 'screenshot-2-sessions',
    headline: 'Join Training\nPartners',
    url: 'https://tribe-v3.vercel.app/',
    waitFor: 3000,
    action: 'scroll', // Scroll to show session cards
  },
  {
    name: 'screenshot-3-create',
    headline: 'Host Your Own\nWorkouts',
    url: 'https://tribe-v3.vercel.app/create',
    waitFor: 3000,
    action: null,
  },
  {
    name: 'screenshot-4-filters',
    headline: 'Filter by Sport\n& Skill Level',
    url: 'https://tribe-v3.vercel.app/',
    waitFor: 2000,
    action: 'openFilters', // Click to open sport dropdown
  },
  {
    name: 'screenshot-5-auth',
    headline: 'Connect With\nYour Crew',
    url: 'https://tribe-v3.vercel.app/auth',
    waitFor: 3000,
    action: null,
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
    deviceScaleFactor: 2, // Retina for crisp screenshots
  });

  // Set mobile user agent
  await page.setUserAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
  );

  const capturedPaths = [];

  for (const config of SCREENSHOTS) {
    console.log(`Capturing: ${config.name} from ${config.url}`);

    try {
      await page.goto(config.url, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, config.waitFor));

      // Handle special actions
      if (config.action === 'scroll') {
        // Scroll down to show session cards better
        await page.evaluate(() => window.scrollBy(0, 200));
        await new Promise(resolve => setTimeout(resolve, 800));
      } else if (config.action === 'openFilters') {
        // Click on the sport dropdown to show filter options
        try {
          await page.click('select');
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (e) {
          console.log('  Could not open filters dropdown');
        }
      }

      const screenshotPath = path.join(TEMP_DIR, `${config.name}.png`);
      await page.screenshot({ path: screenshotPath, type: 'png' });

      capturedPaths.push({ ...config, path: screenshotPath });
      console.log(`  ✓ Saved to ${screenshotPath}`);
    } catch (error) {
      console.error(`  ✗ Failed to capture ${config.name}: ${error.message}`);
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
  // Phone takes up ~75% of remaining space
  const phoneAreaTop = underlineY + 80;
  const phoneAreaBottom = HEIGHT - 180; // Leave room for logo
  const phoneAreaHeight = phoneAreaBottom - phoneAreaTop;

  // Calculate phone dimensions (maintain iPhone aspect ratio ~0.462)
  const phoneAspectRatio = PHONE_WIDTH / PHONE_HEIGHT;
  let phoneHeight = phoneAreaHeight * 0.92; // 92% of available space
  let phoneWidth = phoneHeight * phoneAspectRatio;

  // Make sure phone isn't too wide
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
  console.log('iOS App Store Screenshot Generator v2');
  console.log('='.repeat(50));
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Size: ${WIDTH} x ${HEIGHT} px\n`);

  // Step 1: Capture live screenshots
  console.log('STEP 1: Capturing screenshots from live app...\n');
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
