// Drawn-button pipeline — mirrors the sprite/face/sound auto-swap pattern:
// drop a PNG named after a button's id into client/public/assets/ui/buttons/, and it
// auto-swaps in for the styled text button. Missing files fail silently and
// the original CSS-styled button stays as-is.

const STATIC_BUTTON_IDS = [
  'btn-create',
  'btn-mode-1v1',
  'btn-mode-2v2',
  'btn-join-submit',
  'btn-start-anyway',
  'btn-rematch',
  'btn-leave',
  'btn-leave-room',
];

function loadImage(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(src);
    img.onerror = () => reject();
    img.src = src;
  });
}

export function applyButtonArt() {
  for (const id of STATIC_BUTTON_IDS) {
    const btn = document.getElementById(id) as HTMLButtonElement | null;
    if (!btn) continue;
    loadImage(`/assets/ui/buttons/${id}.png`)
      .then((src) => {
        btn.classList.add('btn-drawn');
        btn.style.setProperty('--btn-art', `url('${src}')`);
      })
      .catch(() => { /* no art file — keep the styled text button */ });
  }

  // the ready button has two states (idle / checked) — only switch to drawn art
  // if BOTH images load, otherwise toggling state could leave it blank mid-lobby
  const readyBtn = document.getElementById('btn-ready') as HTMLButtonElement | null;
  if (readyBtn) {
    Promise.all([
      loadImage('/assets/ui/buttons/btn-ready.png'),
      loadImage('/assets/ui/buttons/btn-ready-checked.png'),
    ])
      .then(([idle, checked]) => {
        readyBtn.classList.add('btn-drawn');
        readyBtn.dataset.artIdle = idle;
        readyBtn.dataset.artChecked = checked;
        readyBtn.style.setProperty('--btn-art', `url('${idle}')`);
      })
      .catch(() => { /* no art — keep the styled text button */ });
  }
}

// call when the ready button's checked state changes — no-op if drawn art isn't active
export function setReadyButtonArt(checked: boolean) {
  const btn = document.getElementById('btn-ready') as HTMLButtonElement | null;
  if (!btn || !btn.classList.contains('btn-drawn')) return;
  const url = checked ? btn.dataset.artChecked : btn.dataset.artIdle;
  if (url) btn.style.setProperty('--btn-art', `url('${url}')`);
}
