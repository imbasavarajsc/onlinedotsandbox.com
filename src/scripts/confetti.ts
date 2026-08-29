export function launchConfetti(canvasId: string = 'confetti-canvas') {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particleCount = 120;
  const particles: Array<{
    x: number;
    y: number;
    size: number;
    color: string;
    vx: number;
    vy: number;
    rotation: number;
    vRotation: number;
  }> = [];

  const colors = ['#00f2fe', '#ff007f', '#fbbf24', '#10b981', '#a855f7', '#38ef7d'];

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: canvas.width / 2 + (Math.random() - 0.5) * 200,
      y: canvas.height / 2 - 50 + (Math.random() - 0.5) * 100,
      size: Math.random() * 8 + 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 16,
      vy: (Math.random() - 0.8) * 18 - 4,
      rotation: Math.random() * Math.PI * 2,
      vRotation: (Math.random() - 0.5) * 0.2,
    });
  }

  let animationFrameId: number;
  let frame = 0;

  function render() {
    ctx!.clearRect(0, 0, canvas.width, canvas.height);
    frame++;

    let activeParticles = 0;

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35; // Gravity
      p.vx *= 0.98; // Air drag
      p.rotation += p.vRotation;

      if (p.y < canvas.height + 50) {
        activeParticles++;
        ctx!.save();
        ctx!.translate(p.x, p.y);
        ctx!.rotate(p.rotation);
        ctx!.fillStyle = p.color;
        ctx!.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx!.restore();
      }
    }

    if (activeParticles > 0 && frame < 180) {
      animationFrameId = requestAnimationFrame(render);
    } else {
      ctx!.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  render();
}
