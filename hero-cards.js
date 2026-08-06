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
const cardsRow = document.querySelector('.hero-cards');

// Matches hero.css's own mobile breakpoint (keep both in sync) and
// main.js's HERO_MOBILE_BREAKPOINT_PX — below this width, hero.css turns
// .hero-cards into a horizontal carousel (see its media query) and this
// script becomes responsible for sliding it to whichever card is active.
const MOBILE_CAROUSEL_QUERY = window.matchMedia('(max-width: 720px)');

let currentIndex = null;
let timerStart = null;

// Slides .hero-cards so the active card sits flush with the row's own
// left padding (its offsetLeft, measured — not computed from card
// width/gap constants, so it stays correct regardless of viewport width
// or any future CSS tweak to those values). No-ops outside the mobile
// carousel breakpoint, where .hero-cards never gets a transform at all.
function updateCarouselTransform() {
  if (!MOBILE_CAROUSEL_QUERY.matches || currentIndex === null) {
    cardsRow.style.transform = '';
    return;
  }
  cardsRow.style.transform = `translateX(${-cards[currentIndex].offsetLeft}px)`;
}

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
  updateCarouselTransform();
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

// Card offsetLeft (what updateCarouselTransform slides against) changes
// with viewport width, and crossing the breakpoint itself flips whether a
// transform should apply at all — resync on both a plain resize (covers
// orientation changes) and the breakpoint's own match state flipping.
window.addEventListener('resize', updateCarouselTransform);
MOBILE_CAROUSEL_QUERY.addEventListener('change', updateCarouselTransform);

requestAnimationFrame(tick);
