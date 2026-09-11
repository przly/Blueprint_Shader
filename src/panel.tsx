import { ArrowLeftRight } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowBigRightDashIcon, type ArrowBigRightDashIconHandle } from "@/components/ui/arrow-big-right-dash";
import { Button } from "@/components/ui/button";
import { DeleteIcon, type DeleteIconHandle } from "@/components/ui/delete";
import { Field, FieldLabel } from "@/components/ui/field";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { MapPinIcon, type MapPinIconHandle } from "@/components/ui/map-pin";
import { Separator } from "@/components/ui/separator";
import { Slider, SliderValue } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { UndoIcon, type UndoIconHandle } from "@/components/ui/undo";
import { UndoDotIcon, type UndoDotIconHandle } from "@/components/ui/undo-dot";
import { UploadIcon, type UploadIconHandle } from "@/components/ui/upload";
import { XIcon, type XIconHandle } from "@/components/ui/x";
import { cn } from "@/lib/utils";
import { controls } from "../main.js";

const CONTROLS_HIDDEN_KEY = "iconMosaic.controlsHidden";

// Content for the bottom-left info card (Figma node 4992:24139), one entry
// per *assigned* Camera Target slot — up to CAMERA_TARGET_SLOT_COUNT (7) in
// main.js, but indexed here by position among whichever of those are
// actually assigned, not by raw slot index, so the card always has exactly
// as many steps as there are targets in use (assign 3, it's Step 1-3;
// assign 5, it's Step 1-5 — see activeTargetPosition's own comment at its
// call site for how a raw slot index gets translated to that). Swaps with
// state.cameraTargetActiveIndex so the card tracks whichever target is
// currently framed (manual 1-7 press, or the /scroll route easing through
// them on scroll). Placeholder copy throughout — only the step number/
// title/text change per target; the icon and layout stay fixed on desktop
// (the icon tile is dropped below sm, see the card's own JSX). Steps 4-7
// are generic placeholders (no real content yet, unlike 1-3) since only 3
// of the 7 slots are actually assigned on the current placeholder model.
// One real icon per assigned target so far (1.svg-4.svg, 56x56 viewBox,
// single fill path each) — steps 5-7 are still content placeholders (see
// CARD_CONTENT below) with no icon of their own yet, so they cycle back
// through these four rather than introducing a second, icon-less path.
const CARD_ICON_PATHS = [
  "M43.4583 35.0002C42.9528 35.0002 42.525 34.8446 42.175 34.5335C41.8639 34.1835 41.7083 33.7557 41.7083 33.2502C41.7083 32.7446 41.8639 32.3363 42.175 32.0252C42.525 31.6752 42.9528 31.5002 43.4583 31.5002H47.25C47.7556 31.5002 48.1639 31.6752 48.475 32.0252C48.825 32.3363 49 32.7446 49 33.2502C49 33.7168 48.825 34.1252 48.475 34.4752C48.1639 34.8252 47.7556 35.0002 47.25 35.0002H43.4583ZM43.4583 44.3335C42.9528 44.3335 42.525 44.1779 42.175 43.8668C41.8639 43.5168 41.7083 43.0891 41.7083 42.5835C41.7083 42.0779 41.8639 41.6696 42.175 41.3585C42.525 41.0085 42.9528 40.8335 43.4583 40.8335H47.25C47.7556 40.8335 48.1639 41.0085 48.475 41.3585C48.825 41.6696 49 42.0779 49 42.5835C49 43.0502 48.825 43.4585 48.475 43.8085C48.1639 44.1585 47.7556 44.3335 47.25 44.3335H43.4583ZM32.6667 46.6668C31.5389 46.6668 30.5667 46.2196 29.75 45.3252C28.9722 44.3918 28.5833 43.2835 28.5833 42.0002H24.7917C24.2861 42.0002 23.8583 41.8446 23.5083 41.5335C23.1972 41.1835 23.0417 40.7557 23.0417 40.2502V35.5835C23.0417 35.0779 23.1972 34.6696 23.5083 34.3585C23.8583 34.0085 24.2861 33.8335 24.7917 33.8335H28.5833C28.5833 32.5502 28.9722 31.4613 29.75 30.5668C30.5667 29.6335 31.5389 29.1668 32.6667 29.1668H38.2083C38.7139 29.1668 39.1222 29.3418 39.4333 29.6918C39.7833 30.0029 39.9583 30.4113 39.9583 30.9168V44.9168C39.9583 45.4224 39.7833 45.8502 39.4333 46.2002C39.1222 46.5113 38.7139 46.6668 38.2083 46.6668H32.6667ZM16.0417 39.6668C13.4361 39.6668 11.2778 38.8307 9.56667 37.1585C7.85556 35.4474 7 33.2696 7 30.6252C7 27.9807 7.85556 25.8224 9.56667 24.1502C11.2778 22.4391 13.4361 21.5835 16.0417 21.5835H19.8333C21.1167 21.5835 22.1667 21.1752 22.9833 20.3585C23.8 19.5418 24.2083 18.4918 24.2083 17.2085C24.2083 15.9252 23.8 14.8752 22.9833 14.0585C22.1667 13.2418 21.1167 12.8335 19.8333 12.8335H11.0833C10.6167 12.8335 10.2083 12.6585 9.85833 12.3085C9.50833 11.9585 9.33333 11.5502 9.33333 11.0835C9.33333 10.5779 9.50833 10.1696 9.85833 9.85849C10.2083 9.5085 10.6167 9.3335 11.0833 9.3335H19.8333C22.0889 9.3335 23.9556 10.0918 25.4333 11.6085C26.95 13.0863 27.7083 14.9529 27.7083 17.2085C27.7083 19.4641 26.95 21.3502 25.4333 22.8668C23.9556 24.3446 22.0889 25.0835 19.8333 25.0835H16.0417C14.4083 25.0835 13.0667 25.5891 12.0167 26.6002C11.0056 27.6113 10.5 28.9529 10.5 30.6252C10.5 32.2974 11.0056 33.6391 12.0167 34.6502C13.0667 35.6613 14.4083 36.1668 16.0417 36.1668H19.5417C20.0472 36.1668 20.4556 36.3418 20.7667 36.6918C21.1167 37.0029 21.2917 37.4113 21.2917 37.9168C21.2917 38.4224 21.1167 38.8502 20.7667 39.2002C20.4556 39.5113 20.0472 39.6668 19.5417 39.6668H16.0417Z",
  "M14 53.6668C13.0278 53.6668 12.1917 53.3363 11.4917 52.6752C10.8306 51.9752 10.5 51.1391 10.5 50.1668V5.8335C10.5 4.90016 10.85 4.08349 11.55 3.3835C12.25 2.6835 13.0667 2.3335 14 2.3335H39.55C40.5222 2.3335 41.3389 2.6835 42 3.3835C42.7 4.04461 43.05 4.86127 43.05 5.8335V14.5835C43.75 14.7002 44.3333 15.0307 44.8 15.5752C45.2667 16.1196 45.5 16.7418 45.5 17.4418V21.7585C45.5 22.4974 45.2667 23.1391 44.8 23.6835C44.3333 24.2279 43.75 24.5585 43.05 24.6752V50.1668C43.05 51.1391 42.7 51.9752 42 52.6752C41.3389 53.3363 40.5222 53.6668 39.55 53.6668H14ZM14 50.1668H39.55V5.8335H14V50.1668ZM14 50.1668V5.8335V50.1668ZM25.0833 35.8752C25.1222 36.1085 25.2 36.3029 25.3167 36.4585C25.4722 36.5752 25.6667 36.6335 25.9 36.6335H27.65C27.8833 36.6335 28.0583 36.5752 28.175 36.4585C28.3306 36.3029 28.4278 36.1085 28.4667 35.8752L28.7 33.9502C29.1667 33.8335 29.5944 33.6585 29.9833 33.4252C30.3722 33.1918 30.7028 32.9196 30.975 32.6085L32.6083 33.3668C32.8028 33.4446 32.9972 33.4641 33.1917 33.4252C33.425 33.3863 33.6 33.2696 33.7167 33.0752L34.5917 31.7335C34.7083 31.5391 34.7472 31.3446 34.7083 31.1502C34.6694 30.9168 34.5528 30.7224 34.3583 30.5668L32.9 29.4585C33.0944 29.0307 33.1917 28.5057 33.1917 27.8835C33.1917 27.2613 33.0944 26.7363 32.9 26.3085L34.3583 25.2002C34.5528 25.0446 34.6694 24.8696 34.7083 24.6752C34.7472 24.4418 34.7083 24.2279 34.5917 24.0335L33.7167 22.6918C33.6 22.4974 33.425 22.3807 33.1917 22.3418C32.9972 22.3029 32.8028 22.3224 32.6083 22.4002L30.975 23.1585C30.7028 22.8474 30.3917 22.5752 30.0417 22.3418C29.6917 22.1085 29.2444 21.9335 28.7 21.8168L28.4667 19.8918C28.4278 19.6585 28.3306 19.4835 28.175 19.3668C28.0583 19.2113 27.8833 19.1335 27.65 19.1335H25.9C25.6667 19.1335 25.4722 19.2113 25.3167 19.3668C25.2 19.4835 25.1222 19.6585 25.0833 19.8918L24.85 21.8168C24.3056 21.9335 23.8583 22.1085 23.5083 22.3418C23.1583 22.5752 22.8472 22.8474 22.575 23.1585L20.9417 22.4002C20.7472 22.3224 20.5333 22.3029 20.3 22.3418C20.1056 22.3807 19.95 22.4974 19.8333 22.6918L18.9583 24.0335C18.8417 24.2279 18.8028 24.4418 18.8417 24.6752C18.8806 24.8696 18.9972 25.0446 19.1917 25.2002L20.65 26.3085C20.4556 26.7363 20.3583 27.2613 20.3583 27.8835C20.3583 28.5057 20.4556 29.0307 20.65 29.4585L19.1917 30.5668C18.9972 30.7224 18.8806 30.9168 18.8417 31.1502C18.8028 31.3446 18.8417 31.5391 18.9583 31.7335L19.8333 33.0752C19.95 33.2696 20.1056 33.3863 20.3 33.4252C20.5333 33.4641 20.7472 33.4446 20.9417 33.3668L22.575 32.6085C22.8472 32.9196 23.1778 33.1918 23.5667 33.4252C23.9556 33.6585 24.3833 33.8335 24.85 33.9502L25.0833 35.8752ZM26.775 31.7335C25.6861 31.7335 24.7722 31.3641 24.0333 30.6252C23.2944 29.8863 22.925 28.9724 22.925 27.8835C22.925 26.7946 23.2944 25.8807 24.0333 25.1418C24.7722 24.4029 25.6861 24.0335 26.775 24.0335C27.8639 24.0335 28.7778 24.4029 29.5167 25.1418C30.2556 25.8807 30.625 26.7946 30.625 27.8835C30.625 28.9724 30.2556 29.8863 29.5167 30.6252C28.7778 31.3641 27.8639 31.7335 26.775 31.7335Z",
  "M8.03125 42C6.59236 42 5.34792 41.4944 4.29792 40.4833C3.28681 39.4333 2.78125 38.1889 2.78125 36.75V19.25C2.78125 17.7722 3.28681 16.5278 4.29792 15.5167C5.34792 14.5056 6.59236 14 8.03125 14H39.4729C39.9785 14 40.3868 14.175 40.6979 14.525C41.0479 14.8361 41.2229 15.2444 41.2229 15.75C41.2229 16.2556 41.0479 16.6833 40.6979 17.0333C40.3868 17.3444 39.9785 17.5 39.4729 17.5H8.03125C7.52569 17.5 7.09792 17.675 6.74792 18.025C6.43681 18.3361 6.28125 18.7444 6.28125 19.25V36.75C6.28125 37.2556 6.43681 37.6833 6.74792 38.0333C7.09792 38.3444 7.52569 38.5 8.03125 38.5H35.9729C36.4785 38.5 36.8868 38.675 37.1979 39.025C37.5479 39.3361 37.7229 39.7444 37.7229 40.25C37.7229 40.7556 37.5479 41.1833 37.1979 41.5333C36.8868 41.8444 36.4785 42 35.9729 42H8.03125ZM8.03125 35V21C8.03125 20.4944 8.18681 20.0861 8.49792 19.775C8.84792 19.425 9.27569 19.25 9.78125 19.25H36.2063C36.9451 19.25 37.4701 19.5806 37.7813 20.2417C38.0924 20.9028 38.0146 21.525 37.5479 22.1083L26.8729 35.4083C26.5618 35.8361 26.1535 36.1667 25.6479 36.4C25.1813 36.6333 24.6757 36.75 24.1313 36.75H9.78125C9.27569 36.75 8.84792 36.5944 8.49792 36.2833C8.18681 35.9333 8.03125 35.5056 8.03125 35ZM42.3896 40.3083C42.234 40.5028 42.059 40.5611 41.8646 40.4833C41.6701 40.3667 41.5924 40.1917 41.6313 39.9583L43.3229 30.3333H37.2563C36.8674 30.3333 36.5951 30.1778 36.4396 29.8667C36.284 29.5556 36.3229 29.2444 36.5563 28.9333L47.1729 15.6917C47.3285 15.4972 47.5035 15.4583 47.6979 15.575C47.8924 15.6528 47.9701 15.8083 47.9313 16.0417L46.2396 25.6667H52.3063C52.6951 25.6667 52.9674 25.8222 53.1229 26.1333C53.2785 26.4444 53.2396 26.7556 53.0063 27.0667L42.3896 40.3083Z",
  "M21 49.6417V45.4417C16.8778 44.0028 13.5139 41.4945 10.9083 37.9167C8.30278 34.3001 7 30.1973 7 25.6084C7 22.6917 7.54444 19.9695 8.63333 17.4417C9.76111 14.8751 11.2583 12.6584 13.125 10.7917C15.0306 8.88618 17.2472 7.38895 19.775 6.30007C22.3417 5.17229 25.0639 4.6084 27.9417 4.6084C30.8194 4.6084 33.5417 5.17229 36.1083 6.30007C38.675 7.38895 40.9111 8.88618 42.8167 10.7917C44.7222 12.6584 46.2194 14.8751 47.3083 17.4417C48.4361 19.9695 49 22.6917 49 25.6084C49 30.1973 47.6778 34.2806 45.0333 37.8584C42.4278 41.3973 39.0833 43.9056 35 45.3834V49.6417C35 50.1473 34.825 50.5751 34.475 50.9251C34.1639 51.2362 33.7556 51.3917 33.25 51.3917C32.7444 51.3917 32.3167 51.2362 31.9667 50.9251C31.6556 50.5751 31.5 50.1473 31.5 49.6417V46.3167C30.9167 46.3945 30.3333 46.4723 29.75 46.5501C29.1667 46.589 28.5639 46.6084 27.9417 46.6084C27.3583 46.6084 26.775 46.589 26.1917 46.5501C25.6083 46.4723 25.0444 46.3945 24.5 46.3167V49.6417C24.5 50.1473 24.325 50.5751 23.975 50.9251C23.6639 51.2362 23.2556 51.3917 22.75 51.3917C22.2444 51.3917 21.8167 51.2362 21.4667 50.9251C21.1556 50.5751 21 50.1473 21 49.6417ZM28 43.2251C32.8611 43.2251 36.9833 41.5334 40.3667 38.1501C43.7889 34.7278 45.5 30.5862 45.5 25.7251C45.5 20.864 43.7889 16.7417 40.3667 13.3584C36.9833 9.93618 32.8611 8.22507 28 8.22507C23.1389 8.22507 18.9972 9.93618 15.575 13.3584C12.1917 16.7417 10.5 20.864 10.5 25.7251C10.5 30.5862 12.1917 34.7278 15.575 38.1501C18.9972 41.5334 23.1389 43.2251 28 43.2251ZM20.4167 20.4751H35.5833C36.0889 20.4751 36.4972 20.3195 36.8083 20.0084C37.1583 19.6584 37.3333 19.2306 37.3333 18.7251C37.3333 18.2195 37.1583 17.8112 36.8083 17.5001C36.4972 17.1501 36.0889 16.9751 35.5833 16.9751H20.4167C19.9111 16.9751 19.4833 17.1501 19.1333 17.5001C18.8222 17.8112 18.6667 18.2195 18.6667 18.7251C18.6667 19.2306 18.8222 19.6584 19.1333 20.0084C19.4833 20.3195 19.9111 20.4751 20.4167 20.4751ZM26.4833 33.3084L24.5 35.2917C24.1111 35.6806 23.9167 36.1278 23.9167 36.6334C23.9167 37.139 24.1111 37.5862 24.5 37.9751C24.8889 38.364 25.3361 38.5584 25.8417 38.5584C26.3472 38.5584 26.7944 38.364 27.1833 37.9751L31.2083 33.9501C31.5583 33.6001 31.7333 33.1917 31.7333 32.7251C31.7333 32.2584 31.5583 31.8501 31.2083 31.5001L29.5167 29.8084L31.5 27.8251C31.8889 27.4362 32.0833 26.989 32.0833 26.4834C32.0833 25.9778 31.8889 25.5306 31.5 25.1417C31.1111 24.7528 30.6639 24.5584 30.1583 24.5584C29.6528 24.5584 29.2056 24.7528 28.8167 25.1417L24.7917 29.1667C24.4417 29.5167 24.2667 29.9251 24.2667 30.3917C24.2667 30.8584 24.4417 31.2667 24.7917 31.6167L26.4833 33.3084Z",
];

const CARD_CONTENT = [
  {
    step: "Step 1 · At Your Site",
    title: "Solar PV · Battery · Inverter · EV charger",
    text: "Solar produces, the battery stores, the inverter connects, and smart loads use energy. SG Connect coordinates them.",
  },
  {
    step: "Step 2 · App Control",
    title: "SG Connect App for overview and control",
    text: "The app shows production, consumption and battery status in real time. The system sends control commands from a plan refreshed every 15 minutes.",
  },
  {
    step: "Step 3 · Plan In Action",
    title: "Surplus is stored, not wasted",
    text: "The battery charges from solar or cheaper grid energy, then supports the site when demand rises.",
  },
  {
    step: "Step 4 · The Boundary",
    title: "The meter is the site boundary",
    text: "Energy can move in or out. SG Connect reduces unnecessary import, lowers peaks and exports only when it makes sense.",
  },
  {
    step: "Step 5",
    title: "Placeholder step 5",
    text: "Content for this step hasn't been written yet.",
  },
  {
    step: "Step 6",
    title: "Placeholder step 6",
    text: "Content for this step hasn't been written yet.",
  },
  {
    step: "Step 7",
    title: "Placeholder step 7",
    text: "Content for this step hasn't been written yet.",
  },
].map((content, i) => ({ ...content, iconPath: CARD_ICON_PATHS[i % CARD_ICON_PATHS.length] }));

type RevealPhase = "closed" | "entering" | "open" | "closing";
const MODAL_CLOSE_MS = 150; // keep in sync with --modal-close-dur in index.css

// Shared open/close lifecycle for anything driven by the --modal-open-dur/
// --modal-close-dur tokens (transitions.dev, 06-modal.md): mount in a
// pre-open state, flip to "open" on the next frame so the enter transition
// actually plays, and on close hold in "closing" for the CSS transition's
// duration before unmounting.
function useRevealPhase(visible: boolean, closeMs: number): RevealPhase {
  const [phase, setPhase] = useState<RevealPhase>(() => (visible ? "open" : "closed"));

  useEffect(() => {
    if (visible) {
      setPhase((p) => (p === "closed" ? "entering" : p === "closing" ? "open" : p));
    } else {
      setPhase((p) => (p === "closed" ? "closed" : "closing"));
    }
  }, [visible]);

  useEffect(() => {
    if (phase !== "entering") return;
    const id = requestAnimationFrame(() => setPhase("open"));
    return () => cancelAnimationFrame(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "closing") return;
    const id = window.setTimeout(() => setPhase("closed"), closeMs);
    return () => window.clearTimeout(id);
  }, [phase, closeMs]);

  return phase;
}

type TextSwapPhase = "rest" | "exit" | "enterStart";
const TEXT_SWAP_MS = 50; // keep in sync with --text-swap-dur in index.css

// Three-phase text/state swap (transitions.dev, 04-text-states-swap.md):
// exit the old value (blur + slide up + fade), swap to the new value while
// invisible and pre-positioned below (no transition), then release on the
// next frame so it eases back to rest. `value` can be any comparable state,
// not just text — the space-bar indicator drives its label AND its color
// off the same delayed `displayed` value so both change together, mid-swap.
function useTextSwap<T>(value: T, exitMs: number): { displayed: T; phase: TextSwapPhase } {
  const [displayed, setDisplayed] = useState(value);
  const [phase, setPhase] = useState<TextSwapPhase>("rest");

  useEffect(() => {
    if (value === displayed) return;
    setPhase("exit");
    const exitTimer = window.setTimeout(() => {
      setDisplayed(value);
      setPhase("enterStart");
    }, exitMs);
    return () => window.clearTimeout(exitTimer);
  }, [value, displayed, exitMs]);

  useEffect(() => {
    if (phase !== "enterStart") return;
    const id = requestAnimationFrame(() => setPhase("rest"));
    return () => cancelAnimationFrame(id);
  }, [phase]);

  return { displayed, phase };
}

type TextsRevealPhase = "hidden" | "shown" | "hiding" | "enterStart";
type TextsRevealDirection = "up" | "down";
const TEXTS_REVEAL_HIDE_MS = 300; // keep in sync with .t-stagger.is-hiding's --stagger-exit-dur in index.css

// Group text-block reveal (transitions.dev, 18-texts-reveal.md, adapted):
// unlike useTextSwap above (one value swapping in place), this fades a whole
// block of stacked lines out together, swaps to the new step's content while
// hidden, then plays the staggered blurred-rise entrance back in — used by
// the bottom-left info card's step/title/text, which all change together
// whenever the active Camera Target does. Takes the target *index* rather
// than an opaque value (contrast useTextSwap) specifically so it can compare
// old vs. new to derive `direction`: scrolling forward (index increasing)
// travels one way, scrolling backward the other — see the CSS's
// data-direction selectors for what that actually moves. This is a
// deliberate departure from the reference snippet's own "quiet fade, no
// Y-return" exit (which exists there specifically so *dismissing* something
// doesn't read as a reversed reveal) — here the whole point is to tie the
// motion's direction to the scroll gesture that caused it.
//
// `revealed` gates the very first entrance, reversibly (contrast
// useTextSwap, which has no such thing and always starts at rest): while
// false, phase sits at "hidden" — same pre-enter offset/opacity/blur as
// "enterStart" (see the CSS's is-entering selectors, which "hidden" maps to
// as well), just without the auto-advance-to-"shown" rAF that "enterStart"
// gets, so it holds there indefinitely instead of immediately playing. The
// moment `revealed` flips true, it's treated exactly like an index change —
// direction "down" (rises up from below, see the CSS's data-direction
// selectors), enterStart, then shown a frame later — so the bottom-left
// info card's first appearance plays the same staggered blurred-rise
// entrance a later step change does, timed to whatever caller-chosen moment
// `revealed` flips at, not simply on mount. If `revealed` later flips back
// to false (the card's own scroll-scrubbed intro reversing because the user
// scrolled back up past it), the second effect below plays that same motion
// in reverse — direction "up" (sinks back down, fading and re-blurring) —
// and settles at "hidden" again rather than continuing on to any particular
// index's entrance, ready to replay the entrance if `revealed` flips true
// once more.
function useTextsReveal(
  index: number,
  hideMs: number,
  revealed: boolean,
): { displayedIndex: number; phase: TextsRevealPhase; direction: TextsRevealDirection } {
  const [displayedIndex, setDisplayedIndex] = useState(index);
  const [phase, setPhase] = useState<TextsRevealPhase>(() => (revealed ? "shown" : "hidden"));
  const [direction, setDirection] = useState<TextsRevealDirection>("down");
  // Read (not depended on) by the exit effect below so its own
  // setPhase("hiding") doesn't retrigger it — with `phase` itself as a
  // dependency there, that self-retrigger's cleanup would cancel the
  // hideTimer it had just set, before the early-return guard skips
  // scheduling a replacement, leaving phase stuck at "hiding" forever (and
  // the entrance effect's "hidden" guard never satisfied again). The
  // entrance effect below has no such timer/cleanup to cancel, so it stays
  // safely keyed off `phase` directly — needed so it can also fire when
  // `phase` settles to "hidden" *after* `revealed` already flipped back to
  // true (rapid scroll-down-up-down near the boundary), not only at the
  // instant `revealed` itself changes.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    if (phase !== "hidden" || !revealed) return;
    setDirection("down");
    setPhase("enterStart");
  }, [phase, revealed]);

  useEffect(() => {
    if (revealed || phaseRef.current === "hidden" || phaseRef.current === "hiding") return;
    setDirection("up");
    setPhase("hiding");
    let settledNaturally = false;
    const hideTimer = window.setTimeout(() => {
      settledNaturally = true;
      setPhase("hidden");
    }, hideMs);
    // If `revealed` flips true again before this fires (rapid scroll back
    // down mid-exit), cleanup cancels the timer — but phase is still
    // "hiding" at that point, and nothing else would ever move it off that
    // (the entrance effect above only fires from "hidden"). Snap straight
    // back to "shown" here instead of leaving it stuck.
    return () => {
      window.clearTimeout(hideTimer);
      if (!settledNaturally) setPhase("shown");
    };
  }, [revealed, hideMs]);

  useEffect(() => {
    if (index === displayedIndex) return;
    setDirection(index > displayedIndex ? "down" : "up");
    setPhase("hiding");
    const hideTimer = window.setTimeout(() => {
      setDisplayedIndex(index);
      setPhase("enterStart");
    }, hideMs);
    return () => window.clearTimeout(hideTimer);
  }, [index, displayedIndex, hideMs]);

  useEffect(() => {
    if (phase !== "enterStart") return;
    const id = requestAnimationFrame(() => setPhase("shown"));
    return () => cancelAnimationFrame(id);
  }, [phase]);

  return { displayedIndex, phase, direction };
}

interface IconAnimationHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

// The lucide-animated icon components only self-trigger on hover over their
// own (icon-sized) bounding box. Buttons want the whole hit area to trigger
// the icon on press (not hover), so the icon is used in "controlled" mode via
// ref and driven from the button's own pointer down/up/leave instead.
function useIconPressHandlers<T extends IconAnimationHandle>() {
  const ref = useRef<T>(null);
  return {
    ref,
    onPointerDown: () => ref.current?.startAnimation(),
    onPointerLeave: () => ref.current?.stopAnimation(),
    onPointerUp: () => ref.current?.stopAnimation(),
  };
}

export function Panel() {
  // The /scroll route always starts with the control panel hidden — same
  // "ignore the shared preference on load, not just fall back to it"
  // treatment as IS_SCROLL_ROUTE's shaderTheme default in main.js, and for
  // the same reason: CONTROLS_HIDDEN_KEY is shared storage across every
  // route, so a "visible" preference saved elsewhere would otherwise leak in
  // here too. The H key can still show it for the current session (see the
  // persist effect below, which skips writing through to storage on this
  // route so that toggle never leaks back out to other routes either).
  const [hidden, setHidden] = useState(() =>
    controls.getInitialState().isScrollRoute ? true : localStorage.getItem(CONTROLS_HIDDEN_KEY) === "1",
  );
  const [state, setState] = useState(() => controls.getInitialState());
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadModelIconPress = useIconPressHandlers<UploadIconHandle>();
  const resetPositionIconPress = useIconPressHandlers<UndoDotIconHandle>();
  const goIconRefs = useRef<(ArrowBigRightDashIconHandle | null)[]>([]);
  const resetViewIconPress = useIconPressHandlers<UndoDotIconHandle>();
  const setDefaultViewIconPress = useIconPressHandlers<MapPinIconHandle>();
  const goDefaultViewIconRef = useRef<ArrowBigRightDashIconHandle | null>(null);
  const resetRotationIconPress = useIconPressHandlers<UndoDotIconHandle>();
  const resetSizeIconPress = useIconPressHandlers<UndoDotIconHandle>();
  const deleteArrowIconPress = useIconPressHandlers<DeleteIconHandle>();
  const undoArrowIconPress = useIconPressHandlers<UndoIconHandle>();
  const clearArrowsIconPress = useIconPressHandlers<XIconHandle>();
  const spaceIndicator = useTextSwap(!!state.spaceHeld, TEXT_SWAP_MS);
  const photoIndicator = useTextSwap(!!state.photoMode, TEXT_SWAP_MS);
  const videoIndicator = useTextSwap(!!state.videoMode, TEXT_SWAP_MS);
  const [videoCountdown, setVideoCountdown] = useState<number | null>(null);
  const flowDrawIndicator = useTextSwap(!!state.modelFlowDrawMode, TEXT_SWAP_MS);

  useEffect(() => controls.subscribe((patch: object) => setState((s) => ({ ...s, ...patch }))), []);

  // Countdown shown in the video-mode pill while a capture is running — main.js
  // only tells the panel *that* it's recording (state.videoRecording), not a
  // live progress tick, so the countdown is ticked down here from the fixed
  // clip length it does expose (state.videoExportDurationMs). Starts fresh
  // every time a recording begins; clears the moment it ends, whether that's
  // the countdown reaching 0 or main.js flipping videoRecording off first.
  useEffect(() => {
    if (!state.videoRecording) {
      setVideoCountdown(null);
      return;
    }
    setVideoCountdown(Math.round((state.videoExportDurationMs ?? 10000) / 1000));
    const id = window.setInterval(() => {
      setVideoCountdown((s) => (s === null ? null : Math.max(0, s - 1)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [state.videoRecording, state.videoExportDurationMs]);

  useEffect(() => {
    // Never persists on the /scroll route — see the forced-hidden default
    // above for why.
    if (state.isScrollRoute) return;
    localStorage.setItem(CONTROLS_HIDDEN_KEY, hidden ? "1" : "0");
  }, [hidden, state.isScrollRoute]);

  useEffect(() => {
    controls.setPanelsHidden(hidden);
  }, [hidden]);

  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "h") return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return; // don't hijack typing into a slider/text field
      setHidden((h) => !h);
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, []);

  useEffect(() => {
    // dragenter/dragleave fire repeatedly as the cursor crosses child element
    // boundaries, so a counter (rather than a single boolean) is needed to
    // know when the drag has actually left the window. main.js has its own
    // window-level drop handler that does the actual model loading; this
    // effect only tracks drag state to show the overlay.
    let depth = 0;
    const isFileDrag = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");

    const onDragEnter = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      depth += 1;
      setIsDraggingFile(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (isFileDrag(event)) event.preventDefault();
    };
    const onDragLeave = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setIsDraggingFile(false);
    };
    const onDrop = () => {
      depth = 0;
      setIsDraggingFile(false);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  const overlayPhase = useRevealPhase(isDraggingFile, MODAL_CLOSE_MS);
  const panelPhase = useRevealPhase(!hidden, MODAL_CLOSE_MS);
  const cameraTargetsPhase = useRevealPhase((state.customModelObjectNames?.length ?? 0) > 0, MODAL_CLOSE_MS);
  const photoOptionsPhase = useRevealPhase(!!state.photoMode, MODAL_CLOSE_MS);
  const lineWidthSliderPhase = useRevealPhase(!!state.photoUniformLineWidth, MODAL_CLOSE_MS);
  const flowObjectsPhase = useRevealPhase((state.selectedFlowArrowObjects?.length ?? 0) > 0, MODAL_CLOSE_MS);
  const sortedCustomModelObjectNames = [...(state.customModelObjectNames ?? [])].sort((a, b) =>
    a.localeCompare(b),
  );
  // The card's step count should match however many Camera Target slots are
  // actually assigned, not the raw 7-slot capacity — cameraTargetActiveIndex
  // is a raw slot index (e.g. 5, if slots 0/2/5 are the only ones assigned),
  // but the card should read "Step 3" there (the 3rd assigned target), not
  // "Step 6". assignedSlotIndices is cameraTargetSlots (main.js's
  // CAMERA_TARGET_SLOT_COUNT-length array of names/nulls) compacted down to
  // just the assigned ones, in slot order; activeTargetPosition is where the
  // active slot falls in that compacted list — the actual CARD_CONTENT
  // index. -1 (nothing assigned yet, or somehow not found) falls back to 0.
  const assignedSlotIndices = (state.cameraTargetSlots ?? []).reduce<number[]>((acc, name, i) => {
    if (name) acc.push(i);
    return acc;
  }, []);
  const activeTargetPosition = Math.max(0, assignedSlotIndices.indexOf(state.cameraTargetActiveIndex ?? -1));
  // Tracks whether scroll is past the very top of the intro span (see the
  // card's own physical-entrance effect below, which flips this the moment
  // scroll crosses off/back to exactly 0) so the card's content plays the
  // same staggered blurred-rise entrance a later step change does — and,
  // reversibly, the same motion backward if the user scrolls back up past
  // it — starting alongside the card's own scroll-driven fade/rise rather
  // than only after it finishes.
  const [cardContentRevealed, setCardContentRevealed] = useState(false);
  const cardContentReveal = useTextsReveal(activeTargetPosition, TEXTS_REVEAL_HIDE_MS, cardContentRevealed);
  const cardContent = CARD_CONTENT[cardContentReveal.displayedIndex] ?? CARD_CONTENT[0];

  // Card's own physical entrance: starts 32px below its resting position,
  // fully transparent and slightly blurred, then rises/fades/sharpens into
  // place across the scroll track's leading "intro" span — during which
  // main.js's own renderCubeFrame (IS_SCROLL_ROUTE branch) deliberately
  // holds the camera still on Target 1 instead of blending anywhere, see
  // its introFraction and updateScrollTrackHeight's matching "+ 1" span.
  // numTargetsRef tracks assignedSlotIndices.length across renders without
  // re-subscribing the scroll listener below (kept in a ref, not read
  // directly in the effect, since the effect intentionally mounts once for
  // the route's lifetime). Driven by direct ref.style writes rather than
  // React state so this reads as continuously scroll-scrubbed, not a
  // discrete step transition — same reasoning as main.js's own
  // SCROLL_SCRUB_SMOOTHING/goal math never touching React either, just for
  // the DOM instead of WebGL.
  const CARD_INTRO_OFFSET_PX = 64;
  const CARD_INTRO_BLUR_PX = 4;
  // Kept in sync with main.js's own SCROLL_INTRO_SPAN_VH_UNITS — both need
  // to agree on how much of the track is intro vs. target-to-target scroll.
  const SCROLL_INTRO_SPAN_VH_UNITS = 0.5;
  const introCardRef = useRef<HTMLDivElement>(null);
  const numTargetsRef = useRef(assignedSlotIndices.length);
  numTargetsRef.current = assignedSlotIndices.length;
  useLayoutEffect(() => {
    if (!state.isScrollRoute) return;
    const card = introCardRef.current;
    if (!card) return;
    let raf = 0;
    // Toggles the content stagger-entrance/exit (see cardContentRevealed
    // above) the moment scroll crosses off/back to exactly 0 — entering
    // alongside the card's own physical reveal instead of only after that
    // finishes, so the two read as one concurrent motion, and reversing
    // (playing the same motion backward, see useTextsReveal's own second
    // effect) if the user scrolls back up past the intro span, same as the
    // card's own physical entrance already does. Tracked in a local var
    // rather than read back off React state so this only ever calls
    // setState on an actual flip — every other scroll tick (this effect
    // keeps handling scroll for the rest of the page) just keeps
    // re-writing the settled style directly, cheaply, without routing back
    // through React.
    let contentRevealedLocal = false;
    const update = () => {
      raf = 0;
      const introFraction =
        SCROLL_INTRO_SPAN_VH_UNITS / (Math.max(1, numTargetsRef.current) + SCROLL_INTRO_SPAN_VH_UNITS);
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const progress = maxScroll > 0 ? Math.max(0, Math.min(1, window.scrollY / maxScroll)) : 0;
      const introProgress = Math.max(0, Math.min(1, progress / introFraction));
      const eased = 1 - (1 - introProgress) ** 3; // ease-out cubic
      card.style.transform = `translateY(${(1 - eased) * CARD_INTRO_OFFSET_PX}px)`;
      card.style.opacity = String(eased);
      card.style.filter = `blur(${(1 - eased) * CARD_INTRO_BLUR_PX}px)`;
      const shouldBeRevealed = introProgress > 0;
      if (shouldBeRevealed !== contentRevealedLocal) {
        contentRevealedLocal = shouldBeRevealed;
        setCardContentRevealed(shouldBeRevealed);
      }
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [state.isScrollRoute]);

  // Animates the card's own height across a step change, below sm only —
  // full-width there, so its content wraps to a different number of lines
  // depending on the step's copy length, and a step change can make the
  // card noticeably taller or shorter. At sm and up the card is back to a
  // fixed 727px width with the icon tile beside the text (see the card's
  // own JSX), and the icon's fixed 200px height comfortably fits the text
  // in every step, so no measured-height animation is needed there —
  // isNarrowViewport gates cardHeight out of the style prop at that
  // breakpoint so the card falls back to natural/auto height instead.
  // cardContentRef sits on the inner content stack, which is left
  // unconstrained (no explicit height of its own) so it always reports its
  // true natural height; CARD_VERTICAL_PADDING_PX (the outer card's own
  // p-6 below sm, top+bottom) is added back on top since the outer card is
  // what actually gets the animated height. null (measured only after
  // mount) falls back to the outer card's own natural/auto height in the
  // style prop below, so there's no jump on first paint before
  // ResizeObserver's first callback fires.
  //
  // A flat duration made grow and shrink feel different even at the same
  // number of ms, since they're rarely the same number of pixels — so
  // duration here is derived from the height delta at a fixed speed
  // (CARD_HEIGHT_PX_PER_MS) instead, clamped to [CARD_HEIGHT_MIN_MS,
  // CARD_HEIGHT_MAX_MS] so a 1px delta doesn't play instantly and a huge
  // one doesn't crawl. Same formula both directions, so grow and shrink
  // genuinely move at the same rate rather than each getting its own
  // hand-picked constant. prevCardHeightRef holds the last *measured*
  // height (not React state, which only commits after this render) purely
  // so the very next ResizeObserver callback can compare against it
  // synchronously.
  const CARD_VERTICAL_PADDING_PX = 48; // keep in sync with the outer card's p-6 below sm
  const CARD_HEIGHT_PX_PER_MS = 0.6; // ~360px in 600ms, the old flat duration's rough default case
  const CARD_HEIGHT_MIN_MS = 150;
  const CARD_HEIGHT_MAX_MS = 500;
  const cardContentRef = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState<number | null>(null);
  const [cardHeightDurationMs, setCardHeightDurationMs] = useState(CARD_HEIGHT_MAX_MS);
  const prevCardHeightRef = useRef<number | null>(null);
  const [isNarrowViewport, setIsNarrowViewport] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches,
  );
  useEffect(() => {
    if (!state.isScrollRoute) return;
    const content = cardContentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(([entry]) => {
      const nextHeight = Math.round(entry.contentRect.height) + CARD_VERTICAL_PADDING_PX;
      const prevHeight = prevCardHeightRef.current;
      if (prevHeight !== null && nextHeight !== prevHeight) {
        const delta = Math.abs(nextHeight - prevHeight);
        const duration = Math.min(CARD_HEIGHT_MAX_MS, Math.max(CARD_HEIGHT_MIN_MS, delta / CARD_HEIGHT_PX_PER_MS));
        setCardHeightDurationMs(duration);
      }
      prevCardHeightRef.current = nextHeight;
      setCardHeight(nextHeight);
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [state.isScrollRoute]);
  useEffect(() => {
    if (!state.isScrollRoute) return;
    const mq = window.matchMedia("(max-width: 639px)");
    const onChange = () => setIsNarrowViewport(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [state.isScrollRoute]);

  return (
    <>
      {/* /scroll-only wash behind the top-left title and bottom-left info
          card, so their dark text stays legible over whatever's rendered on
          the 3D canvas underneath. Sits above the canvas purely by DOM
          order (the canvas is a plain position:fixed element that comes
          before #react-controls-root in scroll.html, and this fragment is
          this component's very first child, so among the z-0-level
          elements here it's the first to paint — everything else in this
          tree, including the z-0 title/card below, stacks on top of it) —
          no explicit z-index needed, and using one here would only risk
          out-ranking the z-0 elements it's meant to sit under. Below sm the
          top-left title block is hidden entirely (see its own hidden sm:flex
          below), so this wash has nothing left to sit behind there and is
          hidden too; sm: and up brings both back, title block visible and
          wash switched to the left-side version that sits behind it. */}
      {state.isScrollRoute && (
        <div className="pointer-events-none fixed inset-x-0 top-0 hidden h-1/2 bg-gradient-to-b from-white to-transparent sm:inset-x-auto sm:inset-y-0 sm:left-0 sm:block sm:h-auto sm:w-1/2 sm:bg-gradient-to-r" />
      )}
      {overlayPhase !== "closed" && (
        <div
          className={cn(
            "t-overlay-backdrop pointer-events-none fixed inset-0 z-20 flex items-center justify-center bg-info/30 backdrop-blur-[1px]",
            overlayPhase === "open" && "is-open",
            overlayPhase === "closing" && "is-closing",
          )}
        >
          <p
            className={cn(
              "t-modal rounded-full border border-white/30 bg-black/50 px-6 py-3 font-semibold text-lg text-white",
              overlayPhase === "open" && "is-open",
              overlayPhase === "closing" && "is-closing",
            )}
          >
            Drop the file to change the model
          </p>
        </div>
      )}

      <div className="pointer-events-none fixed right-4 bottom-4 z-10 flex items-center gap-1.5 text-muted-foreground text-xs">
        <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">H</Kbd>
        hides the panels
      </div>

      {panelPhase !== "closed" && (
        <div className="pointer-events-none fixed top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <svg
            className={cn(
              "t-fade-center size-5 text-white/25",
              panelPhase === "open" && "is-open",
              panelPhase === "closing" && "is-closing",
            )}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.5"
            viewBox="0 0 24 24"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          </svg>
        </div>
      )}

      {panelPhase !== "closed" && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2">
          <button
            className={cn(
              "t-fade-center pointer-events-auto cursor-pointer overflow-hidden rounded-full border px-3 py-1.5 font-medium text-xs shadow-lg backdrop-blur-sm transition-colors duration-[var(--text-swap-dur)]",
              flowDrawIndicator.displayed
                ? "border-transparent bg-white text-black"
                : "border-input bg-popover/80 text-foreground",
              panelPhase === "open" && "is-open",
              panelPhase === "closing" && "is-closing",
            )}
            onClick={() => {
              const next = !state.modelFlowDrawMode;
              controls.setModelFlowDraw(next);
              // main.js resets position on enable, and disables rotation
              // again on disable — mirror that here too, same as the
              // dedicated "Reset position"/rotation controls do.
              setState((s) => ({
                ...s,
                modelFlowDrawMode: next,
                modelOffsetX: next ? 0 : s.modelOffsetX,
                modelOffsetY: next ? 0 : s.modelOffsetY,
                rotationDisabled: next ? s.rotationDisabled : true,
              }));
            }}
            type="button"
          >
            <span
              className={cn(
                "t-text-swap",
                flowDrawIndicator.phase === "exit" && (state.modelFlowDrawMode ? "is-exit-up" : "is-exit-down"),
                flowDrawIndicator.phase === "enterStart" &&
                  (state.modelFlowDrawMode ? "is-enter-from-bottom" : "is-enter-from-top"),
              )}
            >
              {flowDrawIndicator.displayed ? (
                <>
                  Click to draw, double-click to finish,{" "}
                  <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">A</Kbd> to exit
                </>
              ) : (
                <>
                  Press <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">A</Kbd> for flow draw mode
                </>
              )}
            </span>
          </button>

          {!state.isScrollRoute && (
          <div className="relative">
            <div
              className={cn(
                "t-fade-center overflow-hidden rounded-full border px-3 py-1.5 font-medium text-xs shadow-lg backdrop-blur-sm transition-colors duration-[var(--text-swap-dur)]",
                photoIndicator.displayed
                  ? "border-transparent bg-white text-black"
                  : "border-input bg-popover/80 text-foreground",
                panelPhase === "open" && "is-open",
                panelPhase === "closing" && "is-closing",
              )}
            >
              <span
                className={cn(
                  "t-text-swap",
                  photoIndicator.phase === "exit" && (state.photoMode ? "is-exit-up" : "is-exit-down"),
                  photoIndicator.phase === "enterStart" &&
                    (state.photoMode ? "is-enter-from-bottom" : "is-enter-from-top"),
                )}
              >
                {photoIndicator.displayed ? (
                  <>
                    Press <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">⇧P</Kbd> to
                    capture, <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">Esc</Kbd> to exit
                  </>
                ) : (
                  <>
                    Press <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">P</Kbd> for photo mode
                  </>
                )}
              </span>
            </div>

            {photoOptionsPhase !== "closed" && (
              <div className="pointer-events-none absolute top-1/2 left-full ml-3 -translate-y-1/2">
                <div
                  className={cn(
                    "t-fade-center pointer-events-auto flex w-72 flex-col gap-2 rounded-xl border border-input bg-popover/80 p-6 text-xs shadow-lg backdrop-blur-sm",
                    photoOptionsPhase === "open" && "is-open",
                    photoOptionsPhase === "closing" && "is-closing",
                  )}
                >
                  <Label className="gap-2.5 text-xs">
                    <Switch
                      checked={!!state.photoExport2x}
                      onCheckedChange={(checked: boolean) => {
                        controls.setPhotoExport2x(checked);
                        setState((s) => ({ ...s, photoExport2x: checked }));
                      }}
                    />
                    @2x resolution
                  </Label>
                  <Label className="gap-2.5 text-xs">
                    <Switch
                      checked={!!state.photoUniformLineWidth}
                      onCheckedChange={(checked: boolean) => {
                        controls.setPhotoUniformLineWidth(checked);
                        setState((s) => ({ ...s, photoUniformLineWidth: checked }));
                      }}
                    />
                    Uniform line width
                    <span className="rounded-full bg-info/15 px-1.5 py-0.5 font-semibold text-[10px] text-info leading-none">
                      New
                    </span>
                  </Label>
                  {lineWidthSliderPhase !== "closed" && (
                    <div
                      className={cn(
                        "t-reveal",
                        lineWidthSliderPhase === "open" && "is-open",
                        lineWidthSliderPhase === "closing" && "is-closing",
                      )}
                    >
                      <Field className="pt-1 pb-2">
                        <Slider
                          max={state.photoLineWidthHalfPxMax}
                          min={state.photoLineWidthHalfPxMin}
                          onValueChange={(value: number | readonly number[]) => {
                            const halfWidthPx = value as number;
                            controls.setPhotoLineWidthHalfPx(halfWidthPx);
                            setState((s) => ({ ...s, photoLineWidthHalfPx: halfWidthPx }));
                          }}
                          step={0.1}
                          value={state.photoLineWidthHalfPx}
                        >
                          <div className="mb-3 flex w-full items-center justify-between gap-1">
                            <FieldLabel className="text-xs sm:text-xs">Line width</FieldLabel>
                            <SliderValue className="text-xs text-muted-foreground" />
                          </div>
                        </Slider>
                      </Field>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          )}

          {!state.isScrollRoute && (
          <div
            className={cn(
              "t-fade-center overflow-hidden rounded-full border px-3 py-1.5 font-medium text-xs shadow-lg backdrop-blur-sm transition-colors duration-[var(--text-swap-dur)]",
              videoIndicator.displayed
                ? "border-transparent bg-white text-black"
                : "border-input bg-popover/80 text-foreground",
              panelPhase === "open" && "is-open",
              panelPhase === "closing" && "is-closing",
            )}
          >
            <span
              className={cn(
                "t-text-swap",
                videoIndicator.phase === "exit" && (state.videoMode ? "is-exit-up" : "is-exit-down"),
                videoIndicator.phase === "enterStart" &&
                  (state.videoMode ? "is-enter-from-bottom" : "is-enter-from-top"),
              )}
            >
              {videoIndicator.displayed ? (
                state.videoRecording ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className="t-record-dot size-1.5 shrink-0 rounded-full bg-destructive" />
                    Recording video… {videoCountdown ?? Math.round((state.videoExportDurationMs ?? 10000) / 1000)}s
                  </span>
                ) : state.pngSequenceExporting ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className="t-record-dot size-1.5 shrink-0 rounded-full bg-destructive" />
                    Exporting PNG sequence… {Math.round((state.pngSequenceProgress ?? 0) * 100)}%
                  </span>
                ) : (
                  <>
                    Press <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">Enter</Kbd> to record,{" "}
                    <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">⌘Enter</Kbd> for PNG sequence,{" "}
                    <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">V</Kbd> to exit
                  </>
                )
              ) : (
                <>
                  Press <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">V</Kbd> for video mode
                </>
              )}
            </span>
          </div>
          )}

          <div
            className={cn(
              "t-fade-center overflow-hidden rounded-full border px-3 py-1.5 font-medium text-xs shadow-lg backdrop-blur-sm transition-colors duration-[var(--text-swap-dur)]",
              spaceIndicator.displayed
                ? "border-transparent bg-white text-black"
                : "border-input bg-popover/80 text-foreground",
              panelPhase === "open" && "is-open",
              panelPhase === "closing" && "is-closing",
            )}
          >
            <span
              className={cn(
                "t-text-swap",
                spaceIndicator.phase === "exit" && (state.spaceHeld ? "is-exit-up" : "is-exit-down"),
                spaceIndicator.phase === "enterStart" &&
                  (state.spaceHeld ? "is-enter-from-bottom" : "is-enter-from-top"),
              )}
            >
              {spaceIndicator.displayed ? (
                "Release to return to default view"
              ) : (
                <>
                  Press <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">Space</Kbd> for bird's-eye view
                </>
              )}
            </span>
          </div>
        </div>
      )}

      {panelPhase !== "closed" && (
        <div
          className={cn(
            "t-panel t-panel-left fixed top-4 left-4 z-10 max-h-[calc(100vh-2rem)] w-[min(92vw,17rem)] overflow-hidden rounded-[24px] border border-border bg-popover/80 text-popover-foreground text-sm shadow-lg backdrop-blur-sm",
            panelPhase === "open" && "is-open",
            panelPhase === "closing" && "is-closing",
          )}
        >
          <div className="panel-scrollbar flex h-full max-h-[calc(100vh-2rem)] flex-col gap-6 overflow-y-auto p-6">
            <h2 className="font-semibold text-base text-foreground">Model Controls</h2>

            <div className="flex flex-wrap items-center gap-4">
              <input
                ref={fileInputRef}
                accept=".obj,.mtl"
                className="hidden"
                multiple
                onChange={(event) => {
                  controls.loadModelFiles(Array.from(event.target.files ?? []));
                  event.target.value = "";
                }}
                type="file"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                onPointerDown={loadModelIconPress.onPointerDown}
                onPointerLeave={loadModelIconPress.onPointerLeave}
                onPointerUp={loadModelIconPress.onPointerUp}
                size="xs"
                variant="outline"
              >
                <UploadIcon className="size-3" ref={loadModelIconPress.ref} />
                Load model…
              </Button>
              <span className="text-muted-foreground text-xs">or drop .obj/.mtl anywhere</span>
              <span className="text-muted-foreground text-xs">{state.cubeModelStatus}</span>
            </div>

            <div className="flex items-center gap-4">
              <Field className="flex-1 gap-3">
                <div className="flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Model size</FieldLabel>
                  <span className="text-muted-foreground text-xs tabular-nums">{state.cubeSize}%</span>
                </div>
                <Slider
                  max={state.cubeSizeMax}
                  min={state.cubeSizeMin}
                  onValueChange={(value: number | readonly number[]) => {
                    const clamped = controls.setCubeSizePercent(value as number);
                    setState((s) => ({ ...s, cubeSize: clamped }));
                  }}
                  value={state.cubeSize}
                />
              </Field>
            </div>

            <div className="flex items-center gap-4">
              <Field className="flex-1 gap-3">
                <div className="flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Model X position</FieldLabel>
                  <span className="text-muted-foreground text-xs tabular-nums">{Math.round(state.modelOffsetX)}</span>
                </div>
                <Slider
                  max={state.modelOffsetMax}
                  min={state.modelOffsetMin}
                  onValueChange={(value: number | readonly number[]) => {
                    const clamped = controls.setModelOffsetXPercent(value as number);
                    setState((s) => ({ ...s, modelOffsetX: clamped }));
                  }}
                  value={state.modelOffsetX}
                />
              </Field>
            </div>

            <div className="flex items-center gap-4">
              <Field className="flex-1 gap-3">
                <div className="flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Model Y position</FieldLabel>
                  <span className="text-muted-foreground text-xs tabular-nums">{Math.round(state.modelOffsetY)}</span>
                </div>
                <Slider
                  disabled={state.editingDefaultView}
                  max={state.modelOffsetMax}
                  min={state.modelOffsetMin}
                  onValueChange={(value: number | readonly number[]) => {
                    const clamped = controls.setModelOffsetYPercent(value as number);
                    setState((s) => ({ ...s, modelOffsetY: clamped }));
                  }}
                  value={state.modelOffsetY}
                />
              </Field>
            </div>

            <div className="flex items-center gap-2">
              <Button
                className="ml-auto"
                onClick={() => { controls.resetModelPosition(); setState((s) => ({ ...s, modelOffsetX: 0, modelOffsetY: 0 })); }}
                onPointerDown={resetPositionIconPress.onPointerDown}
                onPointerLeave={resetPositionIconPress.onPointerLeave}
                onPointerUp={resetPositionIconPress.onPointerUp}
                size="xs"
                variant="outline"
              >
                <UndoDotIcon className="size-3" ref={resetPositionIconPress.ref} />
                Reset position
              </Button>
              <Button
                onClick={() => {
                  const clamped = controls.setCubeSizePercent(100);
                  setState((s) => ({ ...s, cubeSize: clamped }));
                }}
                onPointerDown={resetSizeIconPress.onPointerDown}
                onPointerLeave={resetSizeIconPress.onPointerLeave}
                onPointerUp={resetSizeIconPress.onPointerUp}
                size="xs"
                variant="outline"
              >
                <UndoDotIcon className="size-3" ref={resetSizeIconPress.ref} />
                Reset size
              </Button>
            </div>

            {cameraTargetsPhase !== "closed" && (
              <div
                className={cn(
                  "t-reveal",
                  cameraTargetsPhase === "open" && "is-open",
                  cameraTargetsPhase === "closing" && "is-closing",
                )}
              >
              <div className="flex flex-col gap-6">
                <Separator />
                <h2 className="font-semibold text-base text-foreground">Camera Targets</h2>
                <div className="flex flex-col gap-4">
                  {/* Keep in sync with CAMERA_TARGET_SLOT_COUNT in main.js —
                      all 7 slots always render (most just "— none —" until
                      assigned) rather than growing/shrinking with however
                      many are in use, so the keyboard shortcuts (1-7) and
                      this list stay predictable. */}
                  {[0, 1, 2, 3, 4, 5, 6].map((slotIndex) => (
                    <div className="flex flex-col gap-1.5" key={slotIndex}>
                      <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                        Target {slotIndex + 1}
                        <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">{slotIndex + 1}</Kbd>
                      </span>
                      <div className="flex items-center gap-2">
                        <select
                          className="h-7 min-w-0 flex-1 truncate rounded-md border border-border bg-background px-2 text-xs"
                          onChange={(event) => {
                            const objectName = event.target.value || null;
                            controls.setCameraTargetSlot(slotIndex, objectName);
                            setState((s) => {
                              const cameraTargetSlots = [...s.cameraTargetSlots];
                              cameraTargetSlots[slotIndex] = objectName;
                              return { ...s, cameraTargetSlots };
                            });
                          }}
                          value={state.cameraTargetSlots?.[slotIndex] ?? ""}
                        >
                          <option value="">— none —</option>
                          {sortedCustomModelObjectNames.map((name: string) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                        <Button
                          className="shrink-0 transition-[color,background-color,border-color,box-shadow] duration-150"
                          disabled={!state.cameraTargetSlots?.[slotIndex] || state.editingDefaultView}
                          onClick={() => {
                            controls.goToCameraTarget(slotIndex);
                            setState((s) => ({ ...s, cameraTargetActiveIndex: slotIndex }));
                          }}
                          onPointerDown={() => goIconRefs.current[slotIndex]?.startAnimation()}
                          onPointerLeave={() => goIconRefs.current[slotIndex]?.stopAnimation()}
                          onPointerUp={() => goIconRefs.current[slotIndex]?.stopAnimation()}
                          size="xs"
                          variant={state.cameraTargetActiveIndex === slotIndex ? "default" : "outline"}
                        >
                          Go
                          <ArrowBigRightDashIcon
                            className="size-3"
                            ref={(el) => {
                              goIconRefs.current[slotIndex] = el;
                            }}
                          />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <div className="flex flex-col gap-1.5">
                    <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                      Default position
                      <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">0</Kbd>
                    </span>
                    {state.editingDefaultView && (
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Pan and zoom the camera, then click Done to save this as the default.
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <Button
                        className="min-w-0 flex-1"
                        onClick={() => controls.setEditingDefaultView(!state.editingDefaultView)}
                        onPointerDown={setDefaultViewIconPress.onPointerDown}
                        onPointerLeave={setDefaultViewIconPress.onPointerLeave}
                        onPointerUp={setDefaultViewIconPress.onPointerUp}
                        size="xs"
                        variant={state.editingDefaultView ? "default" : "outline"}
                      >
                        <MapPinIcon className="size-3" ref={setDefaultViewIconPress.ref} />
                        {state.editingDefaultView ? "Done editing" : "Edit default position"}
                      </Button>
                      <Button
                        className="shrink-0"
                        disabled={!state.hasDefaultCameraView || state.editingDefaultView}
                        onClick={() => controls.goToDefaultCameraView()}
                        onPointerDown={() => goDefaultViewIconRef.current?.startAnimation()}
                        onPointerLeave={() => goDefaultViewIconRef.current?.stopAnimation()}
                        onPointerUp={() => goDefaultViewIconRef.current?.stopAnimation()}
                        size="xs"
                        variant="outline"
                      >
                        Go
                        <ArrowBigRightDashIcon className="size-3" ref={goDefaultViewIconRef} />
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Button
                    className="ml-auto"
                    disabled={state.cameraTargetActiveIndex == null || state.editingDefaultView}
                    onClick={() => {
                      controls.resetCameraTarget();
                      setState((s) => ({ ...s, cameraTargetActiveIndex: null }));
                    }}
                    onPointerDown={resetViewIconPress.onPointerDown}
                    onPointerLeave={resetViewIconPress.onPointerLeave}
                    onPointerUp={resetViewIconPress.onPointerUp}
                    size="xs"
                    variant="outline"
                  >
                    <UndoDotIcon className="size-3" ref={resetViewIconPress.ref} />
                    Reset view
                  </Button>
                </div>
                <Label className="gap-2.5 text-xs">
                  <Switch
                    checked={!!state.showCameraTargetBoxes}
                    onCheckedChange={(checked: boolean) => {
                      controls.setShowCameraTargetBoxes(checked);
                      setState((s) => ({ ...s, showCameraTargetBoxes: checked }));
                    }}
                  />
                  Show target bounding boxes
                </Label>
                <Label className="gap-2.5 text-xs">
                  <Switch
                    checked={!!state.showTargetMaterials}
                    onCheckedChange={(checked: boolean) => {
                      controls.setShowTargetMaterials(checked);
                      setState((s) => ({ ...s, showTargetMaterials: checked }));
                    }}
                  />
                  Show target materials
                </Label>
              </div>
              </div>
            )}

            <Separator />

            <h2 className="font-semibold text-base text-foreground">Shader Controls</h2>

            <div className="flex items-center gap-4">
              <Label className="gap-2.5 text-xs">
                <Switch
                  checked={!state.blueprintEnabled}
                  onCheckedChange={(checked: boolean) => {
                    const enabled = !checked;
                    controls.setBlueprintEnabled(enabled);
                    setState((s) => ({ ...s, blueprintEnabled: enabled }));
                  }}
                />
                Hide blueprint shader
              </Label>
            </div>

            <div className="flex items-center gap-4">
              <Field className="flex-1 gap-3">
                <FieldLabel className="text-xs sm:text-xs">Shader theme</FieldLabel>
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => {
                      controls.setShaderTheme("dark");
                      setState((s) => ({ ...s, shaderTheme: "dark" }));
                    }}
                    size="xs"
                    variant={state.shaderTheme === "dark" ? "default" : "outline"}
                  >
                    Dark
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => {
                      controls.setShaderTheme("light");
                      setState((s) => ({ ...s, shaderTheme: "light" }));
                    }}
                    size="xs"
                    variant={state.shaderTheme === "light" ? "default" : "outline"}
                  >
                    Light
                  </Button>
                </div>
              </Field>
            </div>

            <div className="flex items-center gap-4">
              <Field className="flex-1 gap-3">
                <div className="flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Line frequency</FieldLabel>
                  <span className="text-muted-foreground text-xs tabular-nums">{state.lineFrequency}</span>
                </div>
                <Slider
                  max={state.lineFrequencyMax}
                  min={state.lineFrequencyMin}
                  onValueChange={(value: number | readonly number[]) => {
                    const clamped = controls.setLineFrequency(value as number);
                    setState((s) => ({ ...s, lineFrequency: clamped }));
                  }}
                  value={state.lineFrequency}
                />
              </Field>
            </div>

            <div className="flex items-center gap-4">
              <Field className="flex-1 gap-3">
                <div className="flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Dot frequency</FieldLabel>
                  <span className="text-muted-foreground text-xs tabular-nums">{state.dotFrequency}</span>
                </div>
                <Slider
                  max={state.dotFrequencyMax}
                  min={state.dotFrequencyMin}
                  onValueChange={(value: number | readonly number[]) => {
                    const clamped = controls.setDotFrequency(value as number);
                    setState((s) => ({ ...s, dotFrequency: clamped }));
                  }}
                  value={state.dotFrequency}
                />
              </Field>
            </div>

            <div className="flex items-center gap-4">
              <Field className="flex-1 gap-3">
                <div className="flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Dot size</FieldLabel>
                  <span className="text-muted-foreground text-xs tabular-nums">{state.dotSize}%</span>
                </div>
                <Slider
                  max={state.dotSizeMax}
                  min={state.dotSizeMin}
                  onValueChange={(value: number | readonly number[]) => {
                    const clamped = controls.setDotSizePercent(value as number);
                    setState((s) => ({ ...s, dotSize: clamped }));
                  }}
                  value={state.dotSize}
                />
              </Field>
            </div>

            <div className="flex items-center gap-4">
              <Field className="flex-1 gap-3">
                <div className="flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Plus frequency</FieldLabel>
                  <span className="text-muted-foreground text-xs tabular-nums">{state.plusFrequency}</span>
                </div>
                <Slider
                  max={state.plusFrequencyMax}
                  min={state.plusFrequencyMin}
                  onValueChange={(value: number | readonly number[]) => {
                    const clamped = controls.setPlusFrequency(value as number);
                    setState((s) => ({ ...s, plusFrequency: clamped }));
                  }}
                  value={state.plusFrequency}
                />
              </Field>
            </div>

            <div className="flex items-center gap-4">
              <Field className="flex-1 gap-3">
                <div className="flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Plus size</FieldLabel>
                  <span className="text-muted-foreground text-xs tabular-nums">{state.plusSize}%</span>
                </div>
                <Slider
                  max={state.plusSizeMax}
                  min={state.plusSizeMin}
                  onValueChange={(value: number | readonly number[]) => {
                    const clamped = controls.setPlusSizePercent(value as number);
                    setState((s) => ({ ...s, plusSize: clamped }));
                  }}
                  value={state.plusSize}
                />
              </Field>
            </div>

            <Separator />

            <h2 className="font-semibold text-base text-foreground">Light controls</h2>

            <div className="flex items-center gap-4">
              <Field className="flex-1 gap-3">
                <div className="flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Light azimuth</FieldLabel>
                  <span className="text-muted-foreground text-xs tabular-nums">{state.lightAzimuth}°</span>
                </div>
                <Slider
                  max={state.lightAzimuthMax}
                  min={state.lightAzimuthMin}
                  onValueChange={(value: number | readonly number[]) => {
                    const azimuth = value as number;
                    controls.setLightAzimuth(azimuth);
                    setState((s) => ({ ...s, lightAzimuth: azimuth }));
                  }}
                  value={state.lightAzimuth}
                />
              </Field>
            </div>

            <div className="flex items-center gap-4">
              <Field className="flex-1 gap-3">
                <div className="flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Light elevation</FieldLabel>
                  <span className="text-muted-foreground text-xs tabular-nums">{state.lightElevation}°</span>
                </div>
                <Slider
                  max={state.lightElevationMax}
                  min={state.lightElevationMin}
                  onValueChange={(value: number | readonly number[]) => {
                    const elevation = value as number;
                    controls.setLightElevation(elevation);
                    setState((s) => ({ ...s, lightElevation: elevation }));
                  }}
                  value={state.lightElevation}
                />
              </Field>
            </div>

            <div className="flex items-center gap-4">
              <Field className="flex-1 gap-3">
                <div className="flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Light intensity</FieldLabel>
                  <span className="text-muted-foreground text-xs tabular-nums">{state.lightIntensity}%</span>
                </div>
                <Slider
                  max={state.lightIntensityMax}
                  min={state.lightIntensityMin}
                  onValueChange={(value: number | readonly number[]) => {
                    const clamped = controls.setLightIntensityPercent(value as number);
                    setState((s) => ({ ...s, lightIntensity: clamped }));
                  }}
                  value={state.lightIntensity}
                />
              </Field>
            </div>

            <Separator />

            <h2 className="font-semibold text-base text-foreground">Interaction Controls</h2>

            <div className="flex items-center gap-4">
              <Label className="gap-2.5 text-xs">
                <Switch
                  checked={!state.hoverMovementPaused}
                  onCheckedChange={(checked: boolean) => {
                    const paused = !checked;
                    controls.setHoverMovementPaused(paused);
                    setState((s) => ({ ...s, hoverMovementPaused: paused }));
                  }}
                />
                Hover
              </Label>
            </div>

            <div className="flex items-center gap-4">
              <Label className="gap-2.5 text-xs">
                <Switch
                  checked={!state.rotationDisabled}
                  onCheckedChange={(checked: boolean) => {
                    const disabled = !checked;
                    controls.setRotationDisabled(disabled);
                    setState((s) => ({ ...s, rotationDisabled: disabled }));
                  }}
                />
                Rotation
                <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">R</Kbd>
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Button
                className="ml-auto"
                onClick={() => controls.resetRotation()}
                onPointerDown={resetRotationIconPress.onPointerDown}
                onPointerLeave={resetRotationIconPress.onPointerLeave}
                onPointerUp={resetRotationIconPress.onPointerUp}
                size="xs"
                variant="outline"
              >
                <UndoDotIcon className="size-3" ref={resetRotationIconPress.ref} />
                Reset rotation
                <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">⇧R</Kbd>
              </Button>
            </div>
          </div>
        </div>
      )}

      {panelPhase !== "closed" && (
        <div
          className={cn(
            "t-panel t-panel-right fixed top-4 right-4 z-10 max-h-[calc(100vh-2rem)] w-[min(92vw,13rem)] overflow-hidden rounded-[24px] border border-border bg-popover/80 text-popover-foreground text-sm shadow-lg backdrop-blur-sm",
            panelPhase === "open" && "is-open",
            panelPhase === "closing" && "is-closing",
          )}
        >
          <div className="panel-scrollbar flex h-full max-h-[calc(100vh-2rem)] flex-col gap-6 overflow-y-auto p-6">
            <h2 className="font-semibold text-base text-foreground">Flow Controls</h2>

            <div className="flex flex-wrap items-center gap-4">
              <Label className="gap-2.5 text-xs">
                <Switch
                  checked={state.showModelFlowArrow}
                  onCheckedChange={(checked: boolean) => {
                    controls.setModelFlowArrowVisible(checked);
                    setState((s) => ({ ...s, showModelFlowArrow: checked }));
                  }}
                />
                Show arrows
              </Label>
              <Label className={cn("gap-2.5 text-xs", !state.showModelFlowArrow && "opacity-40")}>
                <Switch
                  checked={state.showModelFlowPoints}
                  disabled={!state.showModelFlowArrow}
                  onCheckedChange={(checked: boolean) => {
                    controls.setModelFlowPointsVisible(checked);
                    setState((s) => ({ ...s, showModelFlowPoints: checked }));
                  }}
                />
                Show points &amp; junctions
              </Label>
              <Label className={cn("gap-2.5 text-xs", !state.showModelFlowArrow && "opacity-40")}>
                <Switch
                  checked={!!state.modelFlowSelectMode}
                  disabled={!state.showModelFlowArrow}
                  onCheckedChange={(checked: boolean) => controls.setModelFlowSelectMode(checked)}
                />
                Select arrow
              </Label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={state.selectedFlowArrowIndex == null}
                onClick={() => controls.deleteSelectedModelFlowArrow()}
                onPointerDown={deleteArrowIconPress.onPointerDown}
                onPointerLeave={deleteArrowIconPress.onPointerLeave}
                onPointerUp={deleteArrowIconPress.onPointerUp}
                size="xs"
                variant="outline"
              >
                <DeleteIcon className="size-3" ref={deleteArrowIconPress.ref} />
                Delete selected
                <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">Del</Kbd>
              </Button>
              <Button
                disabled={state.selectedFlowArrowIndex == null}
                onClick={() => controls.reverseSelectedFlowArrow()}
                size="xs"
                variant={state.selectedFlowArrowReversed ? "default" : "outline"}
              >
                <ArrowLeftRight className="size-3" />
                Reverse flow
              </Button>
              <Button
                onClick={() => controls.undoModelFlowArrow()}
                onPointerDown={undoArrowIconPress.onPointerDown}
                onPointerLeave={undoArrowIconPress.onPointerLeave}
                onPointerUp={undoArrowIconPress.onPointerUp}
                size="xs"
                variant="outline"
              >
                <UndoIcon className="size-3" ref={undoArrowIconPress.ref} />
                Undo last arrow
                <Kbd className="h-auto min-w-0 w-auto p-1 text-[10px] leading-none">⌘Z</Kbd>
              </Button>
              <Button
                onClick={() => controls.clearModelFlow()}
                onPointerDown={clearArrowsIconPress.onPointerDown}
                onPointerLeave={clearArrowsIconPress.onPointerLeave}
                onPointerUp={clearArrowsIconPress.onPointerUp}
                size="xs"
                variant="outline"
              >
                <XIcon className="size-3" ref={clearArrowsIconPress.ref} />
                Clear arrows
              </Button>
            </div>

            {flowObjectsPhase !== "closed" && (
              <div
                className={cn(
                  "t-reveal",
                  flowObjectsPhase === "open" && "is-open",
                  flowObjectsPhase === "closing" && "is-closing",
                )}
              >
              <div className="flex flex-col gap-2">
                <span className="text-muted-foreground text-xs">
                  Selected arrow affects
                </span>
                {(state.selectedFlowArrowObjects ?? []).map((obj: { index: number; name: string; enabled: boolean }) => (
                  <Label className="gap-2.5 text-xs" key={obj.index}>
                    <Switch
                      checked={obj.enabled}
                      onCheckedChange={(checked: boolean) => {
                        controls.setFlowArrowObjectEnabled(obj.index, checked);
                        setState((s) => ({
                          ...s,
                          selectedFlowArrowObjects: s.selectedFlowArrowObjects.map((o: typeof obj) =>
                            o.index === obj.index ? { ...o, enabled: checked } : o,
                          ),
                        }));
                      }}
                    />
                    {obj.name}
                  </Label>
                ))}
              </div>
              </div>
            )}

            <Field>
              <Slider
                max={30}
                min={1}
                onValueChange={(value: number | readonly number[]) => {
                  const width = value as number;
                  controls.setPulseWidth(width);
                  setState((s) => ({ ...s, pulseWidth: width }));
                }}
                value={state.pulseWidth}
              >
                <div className="mb-3 flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Pulse width</FieldLabel>
                  <SliderValue className="text-xs text-muted-foreground" />
                </div>
              </Slider>
            </Field>

            <Field>
              <Slider
                max={state.flowPulseFrequencyMax}
                min={state.flowPulseFrequencyMin}
                onValueChange={(value: number | readonly number[]) => {
                  const frequency = value as number;
                  controls.setFlowPulseFrequency(frequency);
                  setState((s) => ({ ...s, flowPulseFrequency: frequency }));
                }}
                value={state.flowPulseFrequency}
              >
                <div className="mb-3 flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Pulse frequency</FieldLabel>
                  <SliderValue className="text-xs text-muted-foreground" />
                </div>
              </Slider>
            </Field>

            <Field>
              <Slider
                max={state.flowSpeedMax}
                min={state.flowSpeedMin}
                onValueChange={(value: number | readonly number[]) => {
                  const speed = value as number;
                  controls.setFlowSpeedPercent(speed);
                  setState((s) => ({ ...s, flowSpeed: speed }));
                }}
                value={state.flowSpeed}
              >
                <div className="mb-3 flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Flow speed</FieldLabel>
                  <SliderValue className="text-xs text-muted-foreground" />
                </div>
              </Slider>
            </Field>

            <Field>
              <Slider
                max={state.flowCoreLengthMax}
                min={state.flowCoreLengthMin}
                onValueChange={(value: number | readonly number[]) => {
                  const length = value as number;
                  controls.setFlowCoreLengthPercent(length);
                  setState((s) => ({ ...s, flowCoreLength: length }));
                }}
                value={state.flowCoreLength}
              >
                <div className="mb-3 flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Core length</FieldLabel>
                  <SliderValue className="text-xs text-muted-foreground" />
                </div>
              </Slider>
            </Field>

            <Label className="gap-2.5 text-xs">
              <Switch
                checked={state.flowTailVisible}
                onCheckedChange={(checked: boolean) => {
                  controls.setFlowTailVisible(checked);
                  setState((s) => ({ ...s, flowTailVisible: checked }));
                }}
              />
              Show tail
            </Label>

            <Field className={cn(!state.flowTailVisible && "opacity-40")}>
              <Slider
                disabled={!state.flowTailVisible}
                max={state.flowTailLengthMax}
                min={state.flowTailLengthMin}
                onValueChange={(value: number | readonly number[]) => {
                  const length = value as number;
                  controls.setFlowTailLengthPercent(length);
                  setState((s) => ({ ...s, flowTailLength: length }));
                }}
                value={state.flowTailLength}
              >
                <div className="mb-3 flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Tail length</FieldLabel>
                  <SliderValue className="text-xs text-muted-foreground" />
                </div>
              </Slider>
            </Field>

            <Field className={cn(!state.flowTailVisible && "opacity-40")}>
              <Slider
                disabled={!state.flowTailVisible}
                max={state.flowTailFalloffMax}
                min={state.flowTailFalloffMin}
                onValueChange={(value: number | readonly number[]) => {
                  const falloff = value as number;
                  controls.setFlowTailFalloff(falloff);
                  setState((s) => ({ ...s, flowTailFalloff: falloff }));
                }}
                value={state.flowTailFalloff}
              >
                <div className="mb-3 flex w-full items-center justify-between gap-1">
                  <FieldLabel className="text-xs sm:text-xs">Tail falloff</FieldLabel>
                  <SliderValue className="text-xs text-muted-foreground" />
                </div>
              </Slider>
            </Field>
          </div>
        </div>
      )}

      {/* Figma: N-GEN / Shuffle Icon Card - Big (node 4992:24139) — a static
          info card, /scroll-only (see isScrollRoute below). Unlike the panel
          chrome above, this is always visible on that route (not tied to
          panelPhase — H can't hide it) and sits below the control panels on
          the z-axis (z-0, under their z-10) so a panel overlapping it in the
          corner stacks on top. At sm and up this is back to the original
          bottom-left-corner treatment: fixed 727px width, 24px off the
          left/bottom edges, icon tile beside the text. Below sm it's
          full-width (left-6 right-6, sm:right-auto cancels that) and stacks
          vertically with the icon tile dropped (see its own hidden sm:flex
          below) since there's no room for it next to the text at that
          width. No project token matches these NGEN brand colors yet (see
          BLUEPRINT_THEMES/BLUEPRINT_FILL_COLOR_GREEN in main.js for the same
          palette on the 3D side), so they're literal hex here rather than a
          token.

          .t-stagger lives on this outer row (not just the text column) so
          the icon can be a .t-stagger-line too — same directional enter/exit
          as the text below it. The tile itself isn't a stagger line, so it
          stays put — only the glyph inside it moves. Its own fill crossfades
          white <-> #44d62c off cardContentReveal.phase instead of sitting
          green all the time: white for as long as the copy is mid-transition
          or hasn't appeared yet ("hiding"/"enterStart"/"hidden"), green once
          it settles into "shown" — same signal the copy's own exit/enter
          already uses, just read directly rather than threaded through
          main.js/notifyModelState. */}
      {state.isScrollRoute && (
      <div
        ref={introCardRef}
        className={cn(
          "t-stagger fixed left-6 right-6 bottom-6 z-0 flex flex-col items-start gap-6 overflow-hidden rounded-[36px] border-[0.5px] border-[#e6eaed] bg-[#f4f6f7] p-6 shadow-lg transition-[height] ease-out sm:right-auto sm:w-[727px] sm:max-w-[calc(100vw-3rem)] sm:flex-row sm:items-start sm:gap-2 sm:p-3",
          cardContentReveal.phase === "shown" && "is-shown",
          cardContentReveal.phase === "hiding" && "is-hiding",
          (cardContentReveal.phase === "enterStart" || cardContentReveal.phase === "hidden") && "is-entering",
        )}
        style={{
          transform: "translateY(64px)",
          opacity: 0,
          filter: "blur(4px)",
          height: isNarrowViewport && cardHeight !== null ? `${cardHeight}px` : undefined,
          transitionDuration: `${cardHeightDurationMs}ms`,
        }}
        data-direction={cardContentReveal.direction}
      >
        <div
          className={cn(
            "relative hidden size-[200px] shrink-0 items-center justify-center overflow-hidden rounded-[24px] transition-colors duration-300 sm:flex",
            cardContentReveal.phase === "shown" ? "bg-[#44d62c]" : "bg-white",
          )}
        >
          {/* Per-step icon (see CARD_ICON_PATHS, sourced from 1.svg-4.svg —
              56x56 viewBox, single fill path each, matching this SVG's own
              size/viewBox exactly) — currentColor instead of each one's
              original hardcoded #041C2C fill so it stays in sync with the
              text-[#041c2c] set here. Centered via the flex parent (not its
              own absolute+translate) specifically so transform stays free
              for .t-stagger-line's own translateY. Keyed by displayedIndex
              so swapping icons is part of the same exit/enter cycle as the
              text next to it, not a mid-transition snap. */}
          <svg
            key={cardContentReveal.displayedIndex}
            aria-hidden="true"
            className="t-stagger-line t-stagger-line--1 size-[56px] text-[#041c2c]"
            fill="none"
            viewBox="0 0 56 56"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d={cardContent.iconPath} fill="currentColor" />
          </svg>
        </div>
        <div
          ref={cardContentRef}
          className="flex w-full min-w-0 flex-1 flex-col items-start gap-3 sm:justify-between sm:gap-4 sm:self-stretch sm:p-5"
        >
          <p className="t-stagger-line t-stagger-line--2 font-mono font-medium text-[#7c868e] text-[12px] uppercase tracking-[-0.24px]">
            {cardContent.step}
          </p>
          <div className="flex w-full flex-col items-start gap-1.5">
            <p className="t-stagger-line t-stagger-line--3 text-[#041c2c] text-[24px] leading-[1.2] font-medium tracking-[-0.48px]">
              {cardContent.title}
            </p>
            <p className="t-stagger-line t-stagger-line--4 text-[#7c868e] text-[14px] leading-[1.5] font-medium">
              {cardContent.text}
            </p>
          </div>
        </div>
      </div>
      )}

      {/* Figma: Heading (node 4332:20249), /scroll-only — the page's own
          top-left title block, same "always visible, not tied to
          panelPhase, z-0 under the control panels" treatment as the
          bottom-left info card above, and the same 24px-off-both-edges
          corner convention (top-6 left-6 mirrors that card's bottom-6
          left-6). Ellipse 4 (the green dot) is a plain solid-fill circle in
          the design (#44d62c, no gradient/stroke), so it's a styled span
          here rather than an imported SVG asset. */}
      {state.isScrollRoute && (
        <div className="fixed top-6 left-6 z-0 hidden max-w-[calc(100vw-3rem)] flex-col items-start gap-6 sm:flex">
          <div className="flex shrink-0 items-center gap-6">
            <span className="size-[10px] shrink-0 rounded-full bg-[#44d62c]" />
            <p className="font-mono font-semibold text-[#7c868e] text-[12px] uppercase tracking-[-0.24px] whitespace-nowrap">
              At your site
            </p>
          </div>
          <div className="w-max max-w-[calc(100vw-3rem)] font-sans font-medium text-[36px] leading-none tracking-[-1.44px] sm:text-[48px]">
            <p className="mb-0 leading-none whitespace-nowrap text-[#7c868e]">What SG{" "}Connect</p>
            <p className="leading-none whitespace-nowrap text-[#041c2c]">does at your site</p>
          </div>
          <p className="max-w-full w-[481px] font-sans text-[#7c868e] text-[14px] leading-[1.5] sm:text-[16px]">
            SG Connect links your devices, app and meter. Data moves up to the app, control moves down to the
            devices, and energy moves where it helps most.
          </p>
        </div>
      )}
    </>
  );
}
