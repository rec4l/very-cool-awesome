export const COLORS = [
  // ordered like a rainbow: red → orange → yellow → green → blue → violet → pink.
  // Re-tuned (#5) so each hue sits ~30° apart on the wheel — the old set had
  // near-duplicate clusters (gold next to yellow, mint/sage/teal all in the same
  // green-cyan band, violet next to lavender) that were hard to tell apart at a
  // glance. One representative per hue band now, spread evenly.
  { hex: '#fecaca', val: 0xfecaca }, // pastel red
  { hex: '#fed7aa', val: 0xfed7aa }, // pastel orange
  { hex: '#fde68a', val: 0xfde68a }, // pastel amber
  { hex: '#d9f99d', val: 0xd9f99d }, // pastel lime
  { hex: '#a7f3d0', val: 0xa7f3d0 }, // pastel mint
  { hex: '#a5f3fc', val: 0xa5f3fc }, // pastel cyan
  { hex: '#b5d5fb', val: 0xb5d5fb }, // pastel blue
  { hex: '#c7d2fe', val: 0xc7d2fe }, // pastel indigo
  { hex: '#ddd6fe', val: 0xddd6fe }, // pastel violet
  { hex: '#f5d0fe', val: 0xf5d0fe }, // pastel fuchsia
  { hex: '#fbcfe8', val: 0xfbcfe8 }, // pastel pink
  { hex: '#fda4af', val: 0xfda4af }, // pastel rose
];
export const FACES = ['happy', 'sad', 'bleh', 'dead', 'gasp', 'smile2', 'tongue', 'angry', 'kawaii', 'kiss', 'nose', 'xvx'];

export function loadPrefs(slotDefaultColor = 0xb5d5fb) {
  const savedColor = localStorage.getItem('vca_color');
  const savedFace  = localStorage.getItem('vca_face');
  const name   = localStorage.getItem('vca_name') || '';
  const color  = savedColor ? (parseInt(savedColor) || slotDefaultColor) : COLORS[Math.floor(Math.random() * COLORS.length)].val;
  const faceId = savedFace || FACES[Math.floor(Math.random() * FACES.length)];

  // first visit (nothing saved yet) — lock in the random pick so it doesn't
  // re-roll on every reload until the player actually changes it
  if (!savedColor || !savedFace) savePrefs(name, color, faceId);

  return { name, color, faceId };
}

export function savePrefs(name: string, color: number, faceId: string) {
  localStorage.setItem('vca_name', name);
  localStorage.setItem('vca_color', String(color));
  localStorage.setItem('vca_face', faceId);
}

let selectedColor = 0xb5d5fb;
let selectedFace  = 'happy';

export function getSelectedColor() { return selectedColor; }
export function getSelectedFace()  { return selectedFace; }

function updatePreview() {
  const colorHex = COLORS.find((c) => c.val === selectedColor)?.hex ?? '#b5d5fb';
  (document.getElementById('preview-ball') as HTMLElement).style.background = colorHex;
  (document.getElementById('preview-face') as HTMLImageElement).src = `/assets/sprites/faces/${selectedFace}.png`;
  // auto-save on every tweak — no separate save step
  const name = (document.getElementById('name-input') as HTMLInputElement).value.trim();
  savePrefs(name, selectedColor, selectedFace);
}

function buildDOM() {
  const palette    = document.getElementById('color-palette')!;
  const facePicker = document.getElementById('face-picker')!;

  COLORS.forEach(({ hex, val }) => {
    const swatch = document.createElement('div');
    swatch.className   = 'color-swatch';
    swatch.style.background = hex;
    swatch.dataset.val = String(val);
    swatch.addEventListener('click', () => {
      selectedColor = val;
      document.querySelectorAll<HTMLElement>('.color-swatch').forEach((s) => s.classList.toggle('selected', s.dataset.val === String(val)));
      document.querySelectorAll<HTMLElement>('.face-ball').forEach((fb) => { fb.style.background = hex; });
      updatePreview();
    });
    palette.appendChild(swatch);
  });

  FACES.forEach((face) => {
    const opt  = document.createElement('div');
    opt.className   = 'face-opt';
    opt.dataset.face = face;

    const ball = document.createElement('div');
    ball.className = 'face-ball';
    ball.style.background = '#b5d5fb';

    const img  = document.createElement('img');
    img.src = `/assets/sprites/faces/${face}.png`;
    img.alt = face;
    ball.appendChild(img);

    opt.appendChild(ball);
    opt.addEventListener('click', () => {
      selectedFace = face;
      document.querySelectorAll<HTMLElement>('.face-opt').forEach((o) => o.classList.toggle('selected', o.dataset.face === face));
      updatePreview();
    });
    facePicker.appendChild(opt);
  });
}

function populate() {
  const prefs  = loadPrefs();
  selectedColor = prefs.color;
  selectedFace  = prefs.faceId;
  (document.getElementById('name-input') as HTMLInputElement).value = prefs.name;

  document.querySelectorAll<HTMLElement>('.color-swatch').forEach((s) => {
    s.classList.toggle('selected', s.dataset.val === String(prefs.color));
  });

  const colorHex = COLORS.find((c) => c.val === prefs.color)?.hex ?? '#b5d5fb';
  document.querySelectorAll<HTMLElement>('.face-ball').forEach((fb) => { fb.style.background = colorHex; });
  (document.getElementById('preview-ball') as HTMLElement).style.background = colorHex;

  document.querySelectorAll<HTMLElement>('.face-opt').forEach((o) => {
    o.classList.toggle('selected', o.dataset.face === prefs.faceId);
  });

  (document.getElementById('preview-face') as HTMLImageElement).src = `/assets/sprites/faces/${prefs.faceId}.png`;
}

export function initSettings() {
  buildDOM();
  populate();
  // color/face changes auto-save via updatePreview; name saves on host/join click
}
