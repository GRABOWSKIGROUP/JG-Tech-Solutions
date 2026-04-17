// Falling matrix that freezes after initial animation
const main = document.querySelector('main');
const canvas = document.createElement('canvas');
main.appendChild(canvas);
const ctx = canvas.getContext('2d');

function randomDrops(count, maxHeight) {
  return Array.from({ length: count }, () => Math.floor(Math.random() * (maxHeight || 25)) + 1);
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  columns = Math.floor(canvas.width / fontSize);
  drops = randomDrops(columns, Math.ceil(canvas.height / fontSize));
}

const chars = 'アァカサタナハマヤャラワガザダバパイィキシチニヒミリギジヂビピウゥクスツヌフムユュルグズヅブプエェケセテネヘメレゲゼデベペオォコソトノホモヨョロゴゾドボポヴー0 1';
const fontSize = 20;
let columns = Math.floor(window.innerWidth / fontSize);
let drops = randomDrops(columns, Math.ceil(window.innerHeight / fontSize));

function remapColor(idx, len) {
  return 'rgba(255, 0, 0, 0.8)';
}

let frame = 0;
let intervalId;

function draw() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < drops.length; i++) {
    const text = chars.charAt(Math.floor(Math.random() * chars.length));
    const x = i * fontSize;
    const y = drops[i] * fontSize;

    ctx.fillStyle = remapColor(drops[i] % 20, 20);
    ctx.font = `${fontSize}px "Helvetica Neue", Helvetica, sans-serif`;
    ctx.fillText(text, x, y);

    if (y > canvas.height && Math.random() > 0.975) {
      drops[i] = 0;
    }
    drops[i]++;
  }

  frame += 1;
  if (frame > 120) {
    clearInterval(intervalId);
    // Freeze frame; leave as-is.
  }
}

resize();
window.addEventListener('resize', resize);

// initial draw frame immediately so tints and streaks appear before interval
draw();
intervalId = setInterval(draw, 50);

