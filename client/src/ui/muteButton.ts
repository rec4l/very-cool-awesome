// ---- mute button ----
// Sprite-based toggle button: drop ui-mute.png and ui-unmute.png into
// /client/public/assets/ui/ and they'll load automatically (same pipeline as
// all other UI sprites). Falls back to an emoji label if the PNGs aren't there yet.
//
// The button is a fixed-position DOM element so it overlays every screen
// (game, post-game, lobby) without needing to be rebuilt per scene.

import { setUserMuted, isUserMuted } from '../audio/sounds';

const UNMUTED_SRC = '/assets/ui/ui-unmute.png';
const MUTED_SRC   = '/assets/ui/ui-mute.png';

let muteBtn: HTMLButtonElement | null = null;
let muteImg: HTMLImageElement | null  = null;

export function initMuteButton() {
  // inject a minimal stylesheet so the :focus ring can't creep back in
  const style = document.createElement('style');
  style.textContent = '#btn-mute-sfx { outline: none !important; box-shadow: none !important; }';
  document.head.appendChild(style);

  muteBtn = document.createElement('button');
  muteBtn.id = 'btn-mute-sfx';
  Object.assign(muteBtn.style, {
    position:                 'fixed',
    bottom:                   '16px',
    right:                    '16px',
    width:                    '40px',
    height:                   '40px',
    padding:                  '0',
    border:                   'none',
    outline:                  'none',
    appearance:               'none',
    WebkitAppearance:         'none',
    WebkitTapHighlightColor:  'transparent',
    background:               'transparent',
    cursor:                   'pointer',
    opacity:                  '0.7',
    transition:               'opacity 0.15s',
    zIndex:                   '1000',
    lineHeight:               '1',
    fontSize:                 '24px',
  });

  muteImg = document.createElement('img');
  Object.assign(muteImg.style, {
    width:            '100%',
    height:           '100%',
    imageRendering:   'pixelated',
    display:          'block',
  });
  muteBtn.appendChild(muteImg);

  muteBtn.addEventListener('mouseenter', () => { muteBtn!.style.opacity = '1'; });
  muteBtn.addEventListener('mouseleave', () => { muteBtn!.style.opacity = '0.7'; });
  muteBtn.addEventListener('click', () => {
    setUserMuted(!isUserMuted());
    syncSprite();
  });

  syncSprite();
  document.body.appendChild(muteBtn);
}

function syncSprite() {
  if (!muteImg || !muteBtn) return;
  const muted = isUserMuted();
  const src   = muted ? MUTED_SRC : UNMUTED_SRC;

  muteImg.style.display = 'block';
  muteBtn.textContent   = ''; // clear any fallback emoji text
  muteBtn.appendChild(muteImg);

  muteImg.onerror = () => {
    // art not drawn yet — show a text fallback so the button still works
    muteImg!.style.display = 'none';
    muteBtn!.textContent   = muted ? '🔇' : '🔊';
  };
  muteImg.src = src;
}
