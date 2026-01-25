const { createCanvas, loadImage, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

// Dimensions for iPhone 6.5" display
const WIDTH = 1284;
const HEIGHT = 2778;

// Brand colors from logo
const COLORS = {
  background: '#2D3748',
  accent: '#C0E863',
  white: '#FFFFFF',
  darkCard: '#1A202C',
  lightCard: '#3D4A5C',
};

// Output directory
const OUTPUT_DIR = path.join(process.env.HOME, 'Desktop', 'app-store-assets');

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

// Helper to draw a phone mockup frame
function drawPhoneMockup(ctx, x, y, width, height) {
  // Phone frame
  ctx.fillStyle = '#1A1A1A';
  roundRect(ctx, x, y, width, height, 40);
  ctx.fill();

  // Screen area (slightly inset)
  ctx.fillStyle = COLORS.darkCard;
  roundRect(ctx, x + 8, y + 8, width - 16, height - 16, 35);
  ctx.fill();

  // Notch
  ctx.fillStyle = '#1A1A1A';
  roundRect(ctx, x + width/2 - 80, y + 8, 160, 35, 15);
  ctx.fill();
}

// Helper to draw session cards
function drawSessionCard(ctx, x, y, width, sport, title, time, participants) {
  // Card background
  ctx.fillStyle = COLORS.lightCard;
  roundRect(ctx, x, y, width, 140, 16);
  ctx.fill();

  // Sport badge
  ctx.fillStyle = COLORS.accent;
  roundRect(ctx, x + 20, y + 20, 80, 30, 8);
  ctx.fill();
  ctx.fillStyle = COLORS.darkCard;
  ctx.font = 'bold 18px Arial';
  ctx.fillText(sport, x + 30, y + 42);

  // Title
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 28px Arial';
  ctx.fillText(title, x + 20, y + 85);

  // Time and participants
  ctx.fillStyle = '#A0AEC0';
  ctx.font = '22px Arial';
  ctx.fillText(`${time} • ${participants} going`, x + 20, y + 118);
}

// Helper to draw chat message
function drawChatMessage(ctx, x, y, width, message, isOwn, senderName) {
  const bubbleColor = isOwn ? COLORS.accent : COLORS.lightCard;
  const textColor = isOwn ? COLORS.darkCard : COLORS.white;

  if (!isOwn && senderName) {
    ctx.fillStyle = '#A0AEC0';
    ctx.font = '18px Arial';
    ctx.fillText(senderName, x, y - 10);
  }

  ctx.fillStyle = bubbleColor;
  roundRect(ctx, x, y, width, 60, 16);
  ctx.fill();

  ctx.fillStyle = textColor;
  ctx.font = '22px Arial';
  ctx.fillText(message, x + 20, y + 38);
}

// Helper to draw filter chip
function drawFilterChip(ctx, x, y, text, isActive) {
  const chipWidth = ctx.measureText(text).width + 40;
  ctx.fillStyle = isActive ? COLORS.accent : COLORS.lightCard;
  roundRect(ctx, x, y, chipWidth, 45, 22);
  ctx.fill();

  ctx.fillStyle = isActive ? COLORS.darkCard : COLORS.white;
  ctx.font = '22px Arial';
  ctx.fillText(text, x + 20, y + 30);

  return chipWidth + 15;
}

async function generateScreenshot1() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Load and draw logo
  try {
    const logo = await loadImage(path.join(__dirname, '..', 'public', 'app-logo.png'));
    ctx.drawImage(logo, WIDTH/2 - 100, 120, 200, 200);
  } catch (e) {
    // Draw text logo fallback
    ctx.fillStyle = COLORS.white;
    ctx.font = 'bold 72px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Tribe', WIDTH/2, 250);
    ctx.fillStyle = COLORS.accent;
    ctx.beginPath();
    ctx.arc(WIDTH/2 + 130, 250, 15, 0, Math.PI * 2);
    ctx.fill();
  }

  // Main headline
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 72px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Find Sessions', WIDTH/2, 450);
  ctx.fillText('Near You', WIDTH/2, 540);

  // Accent underline
  ctx.fillStyle = COLORS.accent;
  roundRect(ctx, WIDTH/2 - 150, 570, 300, 8, 4);
  ctx.fill();

  // Phone mockup
  const phoneWidth = 380;
  const phoneHeight = 780;
  const phoneX = WIDTH/2 - phoneWidth/2;
  const phoneY = 680;

  drawPhoneMockup(ctx, phoneX, phoneY, phoneWidth, phoneHeight);

  // Map mockup inside phone
  ctx.fillStyle = '#4A5568';
  roundRect(ctx, phoneX + 20, phoneY + 60, phoneWidth - 40, 350, 12);
  ctx.fill();

  // Map pins
  const pins = [
    { x: phoneX + 100, y: phoneY + 180 },
    { x: phoneX + 200, y: phoneY + 250 },
    { x: phoneX + 280, y: phoneY + 150 },
    { x: phoneX + 150, y: phoneY + 320 },
  ];

  pins.forEach(pin => {
    ctx.fillStyle = COLORS.accent;
    ctx.beginPath();
    ctx.arc(pin.x, pin.y, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.darkCard;
    ctx.beginPath();
    ctx.arc(pin.x, pin.y, 8, 0, Math.PI * 2);
    ctx.fill();
  });

  // Session cards in phone
  drawSessionCard(ctx, phoneX + 20, phoneY + 430, phoneWidth - 40, 'Run', 'Morning 5K Run', '7:00 AM', '4');
  drawSessionCard(ctx, phoneX + 20, phoneY + 590, phoneWidth - 40, 'Gym', 'Leg Day Session', '6:00 PM', '2');

  // Bottom tagline
  ctx.fillStyle = COLORS.white;
  ctx.font = '32px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Discover training sessions in your area', WIDTH/2, HEIGHT - 200);

  // Accent dot
  ctx.fillStyle = COLORS.accent;
  ctx.beginPath();
  ctx.arc(WIDTH/2, HEIGHT - 120, 12, 0, Math.PI * 2);
  ctx.fill();

  // Save
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(OUTPUT_DIR, 'screenshot-1-home.png'), buffer);
  console.log('Generated screenshot-1-home.png');
}

async function generateScreenshot2() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Logo
  try {
    const logo = await loadImage(path.join(__dirname, '..', 'public', 'app-logo.png'));
    ctx.drawImage(logo, WIDTH/2 - 100, 120, 200, 200);
  } catch (e) {
    ctx.fillStyle = COLORS.white;
    ctx.font = 'bold 72px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Tribe', WIDTH/2, 250);
  }

  // Headline
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 72px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Join Training', WIDTH/2, 450);
  ctx.fillText('Partners', WIDTH/2, 540);

  // Accent underline
  ctx.fillStyle = COLORS.accent;
  roundRect(ctx, WIDTH/2 - 120, 570, 240, 8, 4);
  ctx.fill();

  // Phone mockup
  const phoneWidth = 380;
  const phoneHeight = 780;
  const phoneX = WIDTH/2 - phoneWidth/2;
  const phoneY = 680;

  drawPhoneMockup(ctx, phoneX, phoneY, phoneWidth, phoneHeight);

  // List of sessions
  const sessions = [
    { sport: 'Soccer', title: 'Pickup Game', time: 'Today 5PM', count: '8' },
    { sport: 'Yoga', title: 'Sunrise Flow', time: 'Tomorrow 6AM', count: '5' },
    { sport: 'Tennis', title: 'Doubles Match', time: 'Sat 10AM', count: '3' },
    { sport: 'Cycling', title: 'Hill Climb', time: 'Sun 7AM', count: '6' },
  ];

  sessions.forEach((session, i) => {
    drawSessionCard(ctx, phoneX + 20, phoneY + 60 + (i * 160), phoneWidth - 40,
      session.sport, session.title, session.time, session.count);
  });

  // Bottom tagline
  ctx.fillStyle = COLORS.white;
  ctx.font = '32px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Never work out alone again', WIDTH/2, HEIGHT - 200);

  ctx.fillStyle = COLORS.accent;
  ctx.beginPath();
  ctx.arc(WIDTH/2, HEIGHT - 120, 12, 0, Math.PI * 2);
  ctx.fill();

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(OUTPUT_DIR, 'screenshot-2-sessions.png'), buffer);
  console.log('Generated screenshot-2-sessions.png');
}

async function generateScreenshot3() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Logo
  try {
    const logo = await loadImage(path.join(__dirname, '..', 'public', 'app-logo.png'));
    ctx.drawImage(logo, WIDTH/2 - 100, 120, 200, 200);
  } catch (e) {
    ctx.fillStyle = COLORS.white;
    ctx.font = 'bold 72px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Tribe', WIDTH/2, 250);
  }

  // Headline
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 72px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Host Your Own', WIDTH/2, 450);
  ctx.fillText('Workouts', WIDTH/2, 540);

  // Accent underline
  ctx.fillStyle = COLORS.accent;
  roundRect(ctx, WIDTH/2 - 140, 570, 280, 8, 4);
  ctx.fill();

  // Phone mockup
  const phoneWidth = 380;
  const phoneHeight = 780;
  const phoneX = WIDTH/2 - phoneWidth/2;
  const phoneY = 680;

  drawPhoneMockup(ctx, phoneX, phoneY, phoneWidth, phoneHeight);

  // Create session form mockup
  const formX = phoneX + 25;
  const formWidth = phoneWidth - 50;

  // Form title
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 28px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('Create Session', formX, phoneY + 90);

  // Sport selector
  ctx.fillStyle = '#A0AEC0';
  ctx.font = '20px Arial';
  ctx.fillText('Sport', formX, phoneY + 140);

  ctx.fillStyle = COLORS.lightCard;
  roundRect(ctx, formX, phoneY + 150, formWidth, 50, 10);
  ctx.fill();
  ctx.fillStyle = COLORS.white;
  ctx.font = '22px Arial';
  ctx.fillText('Running', formX + 15, phoneY + 183);

  // Date/Time
  ctx.fillStyle = '#A0AEC0';
  ctx.font = '20px Arial';
  ctx.fillText('Date & Time', formX, phoneY + 230);

  ctx.fillStyle = COLORS.lightCard;
  roundRect(ctx, formX, phoneY + 240, formWidth, 50, 10);
  ctx.fill();
  ctx.fillStyle = COLORS.white;
  ctx.font = '22px Arial';
  ctx.fillText('Tomorrow, 7:00 AM', formX + 15, phoneY + 273);

  // Location
  ctx.fillStyle = '#A0AEC0';
  ctx.font = '20px Arial';
  ctx.fillText('Location', formX, phoneY + 320);

  ctx.fillStyle = COLORS.lightCard;
  roundRect(ctx, formX, phoneY + 330, formWidth, 50, 10);
  ctx.fill();
  ctx.fillStyle = COLORS.white;
  ctx.font = '22px Arial';
  ctx.fillText('Parque Lleras', formX + 15, phoneY + 363);

  // Skill Level
  ctx.fillStyle = '#A0AEC0';
  ctx.font = '20px Arial';
  ctx.fillText('Skill Level', formX, phoneY + 410);

  const levels = ['Beginner', 'Intermediate', 'Advanced'];
  let levelX = formX;
  levels.forEach((level, i) => {
    const isActive = i === 1;
    ctx.fillStyle = isActive ? COLORS.accent : COLORS.lightCard;
    const chipWidth = 100;
    roundRect(ctx, levelX, phoneY + 420, chipWidth, 40, 20);
    ctx.fill();
    ctx.fillStyle = isActive ? COLORS.darkCard : COLORS.white;
    ctx.font = '18px Arial';
    ctx.fillText(level, levelX + 10, phoneY + 447);
    levelX += chipWidth + 10;
  });

  // Create button
  ctx.fillStyle = COLORS.accent;
  roundRect(ctx, formX, phoneY + 500, formWidth, 55, 27);
  ctx.fill();
  ctx.fillStyle = COLORS.darkCard;
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Create Session', phoneX + phoneWidth/2, phoneY + 537);

  // Bottom tagline
  ctx.fillStyle = COLORS.white;
  ctx.font = '32px Arial';
  ctx.fillText('Lead your community', WIDTH/2, HEIGHT - 200);

  ctx.fillStyle = COLORS.accent;
  ctx.beginPath();
  ctx.arc(WIDTH/2, HEIGHT - 120, 12, 0, Math.PI * 2);
  ctx.fill();

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(OUTPUT_DIR, 'screenshot-3-create.png'), buffer);
  console.log('Generated screenshot-3-create.png');
}

async function generateScreenshot4() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Logo
  try {
    const logo = await loadImage(path.join(__dirname, '..', 'public', 'app-logo.png'));
    ctx.drawImage(logo, WIDTH/2 - 100, 120, 200, 200);
  } catch (e) {
    ctx.fillStyle = COLORS.white;
    ctx.font = 'bold 72px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Tribe', WIDTH/2, 250);
  }

  // Headline
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 72px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Connect With', WIDTH/2, 450);
  ctx.fillText('Your Crew', WIDTH/2, 540);

  // Accent underline
  ctx.fillStyle = COLORS.accent;
  roundRect(ctx, WIDTH/2 - 130, 570, 260, 8, 4);
  ctx.fill();

  // Phone mockup
  const phoneWidth = 380;
  const phoneHeight = 780;
  const phoneX = WIDTH/2 - phoneWidth/2;
  const phoneY = 680;

  drawPhoneMockup(ctx, phoneX, phoneY, phoneWidth, phoneHeight);

  // Chat header
  ctx.fillStyle = COLORS.darkCard;
  roundRect(ctx, phoneX + 15, phoneY + 55, phoneWidth - 30, 60, 12);
  ctx.fill();
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('Morning 5K Run', phoneX + 30, phoneY + 95);
  ctx.fillStyle = '#A0AEC0';
  ctx.font = '18px Arial';
  ctx.fillText('4 participants', phoneX + 200, phoneY + 95);

  // Chat messages
  const messages = [
    { text: "Who's bringing water?", isOwn: false, sender: 'Carlos', y: phoneY + 160 },
    { text: "I got it covered!", isOwn: true, sender: null, y: phoneY + 260 },
    { text: "Meeting at the park entrance?", isOwn: false, sender: 'Maria', y: phoneY + 360 },
    { text: "Yes! See everyone at 7am", isOwn: true, sender: null, y: phoneY + 460 },
  ];

  messages.forEach(msg => {
    const x = msg.isOwn ? phoneX + 100 : phoneX + 30;
    const width = 250;
    drawChatMessage(ctx, x, msg.y, width, msg.text, msg.isOwn, msg.sender);
  });

  // Input field
  ctx.fillStyle = COLORS.lightCard;
  roundRect(ctx, phoneX + 20, phoneY + 570, phoneWidth - 100, 50, 25);
  ctx.fill();
  ctx.fillStyle = '#A0AEC0';
  ctx.font = '20px Arial';
  ctx.fillText('Type a message...', phoneX + 40, phoneY + 602);

  // Send button
  ctx.fillStyle = COLORS.accent;
  ctx.beginPath();
  ctx.arc(phoneX + phoneWidth - 50, phoneY + 595, 25, 0, Math.PI * 2);
  ctx.fill();

  // Bottom tagline
  ctx.fillStyle = COLORS.white;
  ctx.font = '32px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Coordinate before you train', WIDTH/2, HEIGHT - 200);

  ctx.fillStyle = COLORS.accent;
  ctx.beginPath();
  ctx.arc(WIDTH/2, HEIGHT - 120, 12, 0, Math.PI * 2);
  ctx.fill();

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(OUTPUT_DIR, 'screenshot-4-chat.png'), buffer);
  console.log('Generated screenshot-4-chat.png');
}

async function generateScreenshot5() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Logo
  try {
    const logo = await loadImage(path.join(__dirname, '..', 'public', 'app-logo.png'));
    ctx.drawImage(logo, WIDTH/2 - 100, 120, 200, 200);
  } catch (e) {
    ctx.fillStyle = COLORS.white;
    ctx.font = 'bold 72px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Tribe', WIDTH/2, 250);
  }

  // Headline
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 72px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Filter by Sport', WIDTH/2, 450);
  ctx.fillText('& Skill Level', WIDTH/2, 540);

  // Accent underline
  ctx.fillStyle = COLORS.accent;
  roundRect(ctx, WIDTH/2 - 150, 570, 300, 8, 4);
  ctx.fill();

  // Phone mockup
  const phoneWidth = 380;
  const phoneHeight = 780;
  const phoneX = WIDTH/2 - phoneWidth/2;
  const phoneY = 680;

  drawPhoneMockup(ctx, phoneX, phoneY, phoneWidth, phoneHeight);

  // Filter panel
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 26px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('Filters', phoneX + 30, phoneY + 90);

  // Sports section
  ctx.fillStyle = '#A0AEC0';
  ctx.font = '20px Arial';
  ctx.fillText('Sports', phoneX + 30, phoneY + 140);

  const sports = [
    { name: 'Running', active: true },
    { name: 'Soccer', active: false },
    { name: 'Yoga', active: true },
    { name: 'Gym', active: false },
    { name: 'Tennis', active: false },
    { name: 'Cycling', active: true },
  ];

  let sportX = phoneX + 30;
  let sportY = phoneY + 160;
  ctx.font = '20px Arial';

  sports.forEach((sport, i) => {
    const chipWidth = ctx.measureText(sport.name).width + 35;
    if (sportX + chipWidth > phoneX + phoneWidth - 30) {
      sportX = phoneX + 30;
      sportY += 55;
    }

    ctx.fillStyle = sport.active ? COLORS.accent : COLORS.lightCard;
    roundRect(ctx, sportX, sportY, chipWidth, 40, 20);
    ctx.fill();

    ctx.fillStyle = sport.active ? COLORS.darkCard : COLORS.white;
    ctx.fillText(sport.name, sportX + 17, sportY + 27);

    sportX += chipWidth + 12;
  });

  // Skill level section
  ctx.fillStyle = '#A0AEC0';
  ctx.font = '20px Arial';
  ctx.fillText('Skill Level', phoneX + 30, phoneY + 310);

  const levels = ['All Levels', 'Beginner', 'Intermediate', 'Advanced'];
  let levelX = phoneX + 30;
  let levelY = phoneY + 330;

  levels.forEach((level, i) => {
    const isActive = i === 0;
    const chipWidth = ctx.measureText(level).width + 35;
    if (levelX + chipWidth > phoneX + phoneWidth - 30) {
      levelX = phoneX + 30;
      levelY += 55;
    }

    ctx.fillStyle = isActive ? COLORS.accent : COLORS.lightCard;
    roundRect(ctx, levelX, levelY, chipWidth, 40, 20);
    ctx.fill();

    ctx.fillStyle = isActive ? COLORS.darkCard : COLORS.white;
    ctx.fillText(level, levelX + 17, levelY + 27);

    levelX += chipWidth + 12;
  });

  // Distance section
  ctx.fillStyle = '#A0AEC0';
  ctx.font = '20px Arial';
  ctx.fillText('Distance', phoneX + 30, phoneY + 460);

  // Distance slider
  ctx.fillStyle = COLORS.lightCard;
  roundRect(ctx, phoneX + 30, phoneY + 480, phoneWidth - 60, 8, 4);
  ctx.fill();

  ctx.fillStyle = COLORS.accent;
  roundRect(ctx, phoneX + 30, phoneY + 480, 200, 8, 4);
  ctx.fill();

  // Slider handle
  ctx.fillStyle = COLORS.accent;
  ctx.beginPath();
  ctx.arc(phoneX + 230, phoneY + 484, 16, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = COLORS.white;
  ctx.font = '18px Arial';
  ctx.fillText('Within 5 km', phoneX + 30, phoneY + 530);

  // Apply button
  ctx.fillStyle = COLORS.accent;
  roundRect(ctx, phoneX + 30, phoneY + 580, phoneWidth - 60, 55, 27);
  ctx.fill();
  ctx.fillStyle = COLORS.darkCard;
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Apply Filters', phoneX + phoneWidth/2, phoneY + 617);

  // Bottom tagline
  ctx.fillStyle = COLORS.white;
  ctx.font = '32px Arial';
  ctx.fillText('Find exactly what you need', WIDTH/2, HEIGHT - 200);

  ctx.fillStyle = COLORS.accent;
  ctx.beginPath();
  ctx.arc(WIDTH/2, HEIGHT - 120, 12, 0, Math.PI * 2);
  ctx.fill();

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(OUTPUT_DIR, 'screenshot-5-filters.png'), buffer);
  console.log('Generated screenshot-5-filters.png');
}

// Run all generators
async function main() {
  console.log('Generating iOS App Store screenshots...\n');

  await generateScreenshot1();
  await generateScreenshot2();
  await generateScreenshot3();
  await generateScreenshot4();
  await generateScreenshot5();

  console.log('\nAll screenshots saved to:', OUTPUT_DIR);
}

main().catch(console.error);
