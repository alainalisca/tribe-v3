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

// Output directory
const OUTPUT_DIR = path.join(process.env.HOME, 'Desktop', 'app-store-assets');

// Screenshot configurations
const SCREENSHOTS = [
  {
    name: 'screenshot-1-profile',
    headline: 'Build Your\nTraining Profile',
    source: path.join(process.env.HOME, 'Desktop', 'PHOTO-2026-01-14-14-42-56.jpg'),
  },
  {
    name: 'screenshot-2-home',
    headline: 'Find Sessions\nNear You',
    source: path.join(process.env.HOME, 'Desktop', 'PHOTO-2026-01-14-14-43-04.jpg'),
  },
  {
    name: 'screenshot-3-create',
    headline: 'Host Your Own\nWorkouts',
    source: path.join(process.env.HOME, 'Desktop', 'PHOTO-2026-01-14-14-43-12.jpg'),
  },
  {
    name: 'screenshot-4-sessions',
    headline: 'Join Training\nPartners',
    source: path.join(process.env.HOME, 'Desktop', 'PHOTO-2026-01-14-14-43-22.jpg'),
  },
];

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
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

// Draw iPhone 14 Pro style frame with screenshot
function drawIPhoneFrame(ctx, x, y, frameWidth, frameHeight, screenshot) {
  const cornerRadius = frameWidth * 0.12;
  const bezelWidth = frameWidth * 0.02;

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

  // Clip to screen area and draw screenshot
  ctx.save();
  roundRect(ctx, screenX, screenY, screenWidth, screenHeight, screenRadius);
  ctx.clip();

  if (screenshot) {
    // Calculate scaling to fill the screen while maintaining aspect ratio
    const imgAspect = screenshot.width / screenshot.height;
    const screenAspect = screenWidth / screenHeight;

    let drawWidth, drawHeight, drawX, drawY;

    if (imgAspect > screenAspect) {
      // Image is wider - fit height
      drawHeight = screenHeight;
      drawWidth = drawHeight * imgAspect;
      drawX = screenX - (drawWidth - screenWidth) / 2;
      drawY = screenY;
    } else {
      // Image is taller - fit width
      drawWidth = screenWidth;
      drawHeight = drawWidth / imgAspect;
      drawX = screenX;
      drawY = screenY;
    }

    ctx.drawImage(screenshot, drawX, drawY, drawWidth, drawHeight);
  }

  ctx.restore();

  // Dynamic Island
  const islandWidth = frameWidth * 0.28;
  const islandHeight = frameHeight * 0.018;
  const islandX = x + (frameWidth - islandWidth) / 2;
  const islandY = y + bezelWidth + frameHeight * 0.01;

  ctx.fillStyle = COLORS.black;
  roundRect(ctx, islandX, islandY, islandWidth, islandHeight, islandHeight / 2);
  ctx.fill();

  // Subtle frame highlight
  ctx.strokeStyle = '#444444';
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
  const textWidth = ctx.measureText(text).width;
  ctx.fillText(text, centerX - size * 0.12, y);

  // Green dot
  ctx.fillStyle = COLORS.accent;
  ctx.beginPath();
  const dotX = centerX + textWidth / 2;
  ctx.arc(dotX, y + size * 0.15, size * 0.12, 0, Math.PI * 2);
  ctx.fill();
}

async function createAppStoreScreenshot(config) {
  console.log(`Creating: ${config.name}...`);

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // --- TOP SECTION: Headlines ---
  const topPadding = 80;
  const headlineY = topPadding + 80;

  // Draw headline text
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 95px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const lines = config.headline.split('\n');
  const lineHeight = 115;

  lines.forEach((line, i) => {
    ctx.fillText(line, WIDTH / 2, headlineY + i * lineHeight);
  });

  // Accent underline
  const underlineY = headlineY + lines.length * lineHeight + 25;
  const underlineWidth = 280;
  ctx.fillStyle = COLORS.accent;
  roundRect(ctx, WIDTH / 2 - underlineWidth / 2, underlineY, underlineWidth, 10, 5);
  ctx.fill();

  // --- MIDDLE SECTION: iPhone with screenshot ---
  const phoneAreaTop = underlineY + 60;
  const phoneAreaBottom = HEIGHT - 150;
  const phoneAreaHeight = phoneAreaBottom - phoneAreaTop;

  // Phone takes up ~70% of available height
  const phoneHeight = phoneAreaHeight * 0.95;
  const phoneAspectRatio = 390 / 844; // iPhone aspect ratio
  let phoneWidth = phoneHeight * phoneAspectRatio;

  // Make sure phone isn't too wide
  if (phoneWidth > WIDTH * 0.8) {
    phoneWidth = WIDTH * 0.8;
  }

  const phoneX = (WIDTH - phoneWidth) / 2;
  const phoneY = phoneAreaTop + (phoneAreaHeight - phoneHeight) / 2;

  // Load screenshot image
  let screenshotImg = null;
  if (fs.existsSync(config.source)) {
    try {
      screenshotImg = await loadImage(config.source);
      console.log(`  Loaded: ${config.source}`);
    } catch (e) {
      console.error(`  Could not load: ${e.message}`);
    }
  } else {
    console.error(`  File not found: ${config.source}`);
  }

  // Draw the iPhone frame with screenshot
  drawIPhoneFrame(ctx, phoneX, phoneY, phoneWidth, phoneHeight, screenshotImg);

  // --- BOTTOM SECTION: Tribe logo ---
  const logoY = HEIGHT - 75;
  drawTribeLogo(ctx, WIDTH / 2, logoY, 50);

  // Save the final image
  const outputPath = path.join(OUTPUT_DIR, `${config.name}.png`);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);

  console.log(`  ✓ Saved: ${outputPath}`);
  return outputPath;
}

async function main() {
  console.log('='.repeat(50));
  console.log('iOS App Store Screenshot Generator');
  console.log('(From provided images)');
  console.log('='.repeat(50));
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Size: ${WIDTH} x ${HEIGHT} px\n`);

  // Clear old screenshots
  const existingFiles = fs.readdirSync(OUTPUT_DIR).filter(f => f.startsWith('screenshot-'));
  for (const file of existingFiles) {
    fs.unlinkSync(path.join(OUTPUT_DIR, file));
  }

  // Create each screenshot
  for (const config of SCREENSHOTS) {
    await createAppStoreScreenshot(config);
  }

  console.log('\n' + '='.repeat(50));
  console.log('All screenshots generated successfully!');
  console.log('='.repeat(50));
}

main().catch(console.error);
