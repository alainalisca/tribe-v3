const puppeteer = require('puppeteer');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

// App Store dimensions
const WIDTH = 1284;
const HEIGHT = 2778;

const COLORS = {
  background: '#2D3748',
  accent: '#C0E863',
  white: '#FFFFFF',
  black: '#000000',
};

const OUTPUT_DIR = path.join(process.env.HOME, 'Desktop', 'app-store-assets');
const TEMP_FILE = path.join(OUTPUT_DIR, 'temp-chat.png');

const CREDENTIALS = {
  email: 'alainalisca@aplusfitnessllc.com',
  password: 'Darian09!',
};

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

function drawIPhoneFrame(ctx, x, y, frameWidth, frameHeight, screenshot) {
  const cornerRadius = frameWidth * 0.12;
  const bezelWidth = frameWidth * 0.02;

  ctx.fillStyle = COLORS.black;
  roundRect(ctx, x, y, frameWidth, frameHeight, cornerRadius);
  ctx.fill();

  const screenX = x + bezelWidth;
  const screenY = y + bezelWidth;
  const screenWidth = frameWidth - bezelWidth * 2;
  const screenHeight = frameHeight - bezelWidth * 2;
  const screenRadius = cornerRadius - bezelWidth;

  ctx.save();
  roundRect(ctx, screenX, screenY, screenWidth, screenHeight, screenRadius);
  ctx.clip();

  if (screenshot) {
    const imgAspect = screenshot.width / screenshot.height;
    const screenAspect = screenWidth / screenHeight;
    let drawWidth, drawHeight, drawX, drawY;

    if (imgAspect > screenAspect) {
      drawHeight = screenHeight;
      drawWidth = drawHeight * imgAspect;
      drawX = screenX - (drawWidth - screenWidth) / 2;
      drawY = screenY;
    } else {
      drawWidth = screenWidth;
      drawHeight = drawWidth / imgAspect;
      drawX = screenX;
      drawY = screenY;
    }
    ctx.drawImage(screenshot, drawX, drawY, drawWidth, drawHeight);
  }

  ctx.restore();

  const islandWidth = frameWidth * 0.28;
  const islandHeight = frameHeight * 0.018;
  const islandX = x + (frameWidth - islandWidth) / 2;
  const islandY = y + bezelWidth + frameHeight * 0.01;

  ctx.fillStyle = COLORS.black;
  roundRect(ctx, islandX, islandY, islandWidth, islandHeight, islandHeight / 2);
  ctx.fill();

  ctx.strokeStyle = '#444444';
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, frameWidth, frameHeight, cornerRadius);
  ctx.stroke();
}

function drawTribeLogo(ctx, centerX, y, size) {
  ctx.fillStyle = COLORS.white;
  ctx.font = `bold ${size}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const text = 'Tribe';
  const textWidth = ctx.measureText(text).width;
  ctx.fillText(text, centerX - size * 0.12, y);

  ctx.fillStyle = COLORS.accent;
  ctx.beginPath();
  ctx.arc(centerX + textWidth / 2, y + size * 0.15, size * 0.12, 0, Math.PI * 2);
  ctx.fill();
}

async function dismissModals(page) {
  try {
    const closeButtons = await page.$$('button');
    for (const btn of closeButtons) {
      const text = await btn.evaluate(el => el.textContent);
      if (text && (text.includes('×') || text.includes('Maybe later') || text.includes('Next') || text.includes('Skip'))) {
        await btn.click();
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
  } catch (e) {}
  try {
    await page.mouse.click(10, 10);
  } catch (e) {}
}

async function main() {
  console.log('Capturing chat screenshot...\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)');

  // Login
  console.log('Logging in...');
  await page.goto('https://tribe-v3.vercel.app/auth', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(resolve => setTimeout(resolve, 2000));

  const emailInput = await page.$('input[type="email"]');
  if (emailInput) {
    await emailInput.click({ clickCount: 3 });
    await emailInput.type(CREDENTIALS.email);
  }

  const passwordInput = await page.$('input[type="password"]');
  if (passwordInput) {
    await passwordInput.click({ clickCount: 3 });
    await passwordInput.type(CREDENTIALS.password);
  }

  await new Promise(resolve => setTimeout(resolve, 500));
  const signInButton = await page.$('button[type="submit"]');
  if (signInButton) await signInButton.click();

  await new Promise(resolve => setTimeout(resolve, 5000));
  await dismissModals(page);

  // Navigate to a session chat
  console.log('Finding session chat...');
  await page.goto('https://tribe-v3.vercel.app/', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(resolve => setTimeout(resolve, 2000));
  await dismissModals(page);

  // Find a session link and go to its chat
  const sessionLink = await page.$('a[href^="/session/"]');
  if (sessionLink) {
    const href = await sessionLink.evaluate(el => el.getAttribute('href'));
    // Extract session ID and go to chat
    const sessionId = href.split('/session/')[1].split('/')[0];
    const chatUrl = `https://tribe-v3.vercel.app/session/${sessionId}/chat`;
    console.log(`Going to: ${chatUrl}`);
    await page.goto(chatUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 3000));
    await dismissModals(page);
  }

  // Take screenshot
  await page.screenshot({ path: TEMP_FILE, type: 'png' });
  console.log('Screenshot captured!\n');

  await browser.close();

  // Create App Store screenshot
  console.log('Creating App Store screenshot...');

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Headline
  const headlineY = 160;
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 95px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Connect With', WIDTH / 2, headlineY);
  ctx.fillText('Your Crew', WIDTH / 2, headlineY + 115);

  // Underline
  const underlineY = headlineY + 255;
  ctx.fillStyle = COLORS.accent;
  roundRect(ctx, WIDTH / 2 - 140, underlineY, 280, 10, 5);
  ctx.fill();

  // Phone
  const phoneAreaTop = underlineY + 60;
  const phoneAreaBottom = HEIGHT - 150;
  const phoneAreaHeight = phoneAreaBottom - phoneAreaTop;
  const phoneHeight = phoneAreaHeight * 0.95;
  const phoneWidth = phoneHeight * (390 / 844);
  const phoneX = (WIDTH - phoneWidth) / 2;
  const phoneY = phoneAreaTop + (phoneAreaHeight - phoneHeight) / 2;

  const screenshotImg = await loadImage(TEMP_FILE);
  drawIPhoneFrame(ctx, phoneX, phoneY, phoneWidth, phoneHeight, screenshotImg);

  // Logo
  drawTribeLogo(ctx, WIDTH / 2, HEIGHT - 75, 50);

  // Save
  const outputPath = path.join(OUTPUT_DIR, 'screenshot-5-chat.png');
  fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));
  console.log(`✓ Saved: ${outputPath}`);

  // Cleanup
  fs.unlinkSync(TEMP_FILE);

  console.log('\nDone!');
}

main().catch(console.error);
