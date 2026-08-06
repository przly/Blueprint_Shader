// Drives the three camera-target trigger cards in hero.html against
// window.heroScene (see main.js's "Hero trigger API" section) — clicking a
// card jumps the camera there; the active card's progress-fill grows over
// CARD_DURATION_MS and, once full, advances to the next card, matching the
// Figma design's own annotation on "Link Tiles": "Trigger cards with timer,
// the lighter element in the background indicates how much time has
// passed. When full, it should move to the next one."
//
// Loaded after main.js (see hero.html's script order) so window.heroScene
// already exists by the time this runs — ES module scripts execute in
// document order.

// How long each card holds before auto-advancing to the next. No value was
// specified in the design; tune freely.
const CARD_DURATION_MS = 10000;

const cards = Array.from(document.querySelectorAll('.hero-card'));

let currentIndex = null;
let timerStart = null;

function setActiveCard(index) {
  currentIndex = index;
  timerStart = performance.now();
  cards.forEach((card, i) => {
    const isActive = i === index;
    card.classList.toggle('is-active', isActive);
    const progress = card.querySelector('.hero-card-progress');
    // Snap back to 0% with no transition before the next frame starts
    // animating it — otherwise switching cards mid-fill would visibly
    // animate the old card's bar draining out instead of just resetting.
    progress.style.transition = 'none';
    progress.style.width = '0%';
  });
}

function tick(now) {
  if (currentIndex !== null && timerStart !== null) {
    const card = cards[currentIndex];
    const progress = card.querySelector('.hero-card-progress');
    const elapsed = now - timerStart;
    const t = Math.min(1, elapsed / CARD_DURATION_MS);
    progress.style.transition = 'width 80ms linear';
    progress.style.width = `${t * 100}%`;
    if (t >= 1) {
      window.heroScene.goToTarget((currentIndex + 1) % cards.length);
    }
  }
  requestAnimationFrame(tick);
}

cards.forEach((card, i) => {
  card.addEventListener('click', () => window.heroScene.goToTarget(i));
});

// Only react to genuine target changes — notifyModelState (main.js) fires
// on other state changes too, not just camera-target switches, and a
// same-index callback would otherwise reset an in-progress timer for no
// reason.
window.heroScene.onTargetChange((index) => {
  if (index === null || index === currentIndex) return;
  setActiveCard(index);
});

// Covers the case where the intro has already landed on a target by the
// time this script runs (unlikely given the intro's own multi-second
// timing, but cheap to handle) — onTargetChange only fires on *future*
// changes, not the current state.
const activeAtLoad = window.heroScene.getActiveTarget();
if (activeAtLoad !== null) setActiveCard(activeAtLoad);

requestAnimationFrame(tick);
