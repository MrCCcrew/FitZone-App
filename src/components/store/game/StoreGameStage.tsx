"use client";
import type { CSSProperties } from "react";
import { FitZoneBearMascot, type MascotState } from "./FitZoneBearMascot";
import { PremiumSpinWheel } from "./PremiumSpinWheel";

type WheelSegment = { id: string; labelAr: string; labelEn?: string; type: string; icon?: string };

export type StoreGameStageProps = {
  segments:       WheelSegment[];
  mascotState:    MascotState;
  onSpin:         () => Promise<{ slotIndex: number }>;
  onSpinComplete: () => void;
  spinDone:       boolean;
};

const CSS = `
@keyframes gstage-in {
  from { opacity:0; transform:translateY(18px) scale(0.96); }
  to   { opacity:1; transform:translateY(0)    scale(1);    }
}
@keyframes gstage-breathe {
  0%,100% { opacity:0.5; }
  50%     { opacity:0.88; }
}
@keyframes gstage-fl1 {
  0%,100% { transform:translateY(0)     rotate(-7deg); opacity:0.38; }
  50%     { transform:translateY(-14px) rotate(7deg);  opacity:0.65; }
}
@keyframes gstage-fl2 {
  0%,100% { transform:translateY(0)     rotate(5deg);  opacity:0.30; }
  50%     { transform:translateY(-10px) rotate(-5deg); opacity:0.52; }
}

.gstage {
  position:relative;
  border-radius:28px;
  overflow:hidden;
  background:linear-gradient(148deg, #1a0030 0%, #110020 48%, #1c000f 100%);
  border:1.5px solid rgba(233,30,99,0.18);
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.04),
    0 14px 52px rgba(0,0,0,0.65),
    0 0 100px rgba(139,92,246,0.07);
  padding:20px 10px 22px;
  animation:gstage-in .65s cubic-bezier(.34,1.3,.64,1) both;
}

.gstage-spot {
  position:absolute;
  top:-70px; left:50%;
  transform:translateX(-50%);
  width:520px; height:380px;
  pointer-events:none;
  background:radial-gradient(ellipse at 50% 0%,
    rgba(233,30,99,.17) 0%,
    rgba(139,92,246,.09) 36%,
    transparent 70%);
  animation:gstage-breathe 4.5s ease-in-out infinite;
}

.gstage-floor {
  position:absolute;
  bottom:-18px; left:50%;
  transform:translateX(-50%);
  width:60%; height:68px;
  pointer-events:none;
  background:radial-gradient(ellipse at center,
    rgba(233,30,99,.09) 0%,
    transparent 70%);
}

.gstage-deco {
  position:absolute;
  pointer-events:none;
  user-select:none;
  z-index:0;
  line-height:1;
}

.gstage-body {
  position:relative;
  z-index:1;
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:0;
}

.gstage-bear  { display:flex; justify-content:center; margin-bottom:6px; }
.gstage-wheel { flex:1; min-width:0; width:100%; }

@media (min-width:700px) {
  .gstage-body { flex-direction:row !important; align-items:center !important; gap:8px !important; }
  .gstage-bear { width:224px; flex-shrink:0; margin-bottom:0 !important; justify-content:center; }
  .gstage-wheel { width:auto; }
}

@media (prefers-reduced-motion:reduce) {
  .gstage       { animation:none !important; }
  .gstage-spot  { animation:none !important; }
  .gstage-deco  { animation:none !important; }
}
`;

type Deco = { emoji: string; pos: CSSProperties; anim: string; size: number };
const DECOS: Deco[] = [
  { emoji:"🎁", pos:{ top:"9%",  left:"2.5%"  }, anim:"gstage-fl1 4.2s ease-in-out 0s    infinite", size:16 },
  { emoji:"⭐", pos:{ top:"17%", right:"3.5%"  }, anim:"gstage-fl2 3.7s ease-in-out .8s   infinite", size:13 },
  { emoji:"💎", pos:{ top:"65%", left:"1.5%"  }, anim:"gstage-fl1 5.0s ease-in-out 1.5s  infinite", size:14 },
  { emoji:"🏆", pos:{ top:"73%", right:"2.5%"  }, anim:"gstage-fl2 4.6s ease-in-out .3s   infinite", size:12 },
  { emoji:"✨", pos:{ top:"42%", left:"1%"    }, anim:"gstage-fl1 3.9s ease-in-out 2.1s  infinite", size:11 },
  { emoji:"🎰", pos:{ top:"37%", right:"1.5%"  }, anim:"gstage-fl2 4.3s ease-in-out 1.2s  infinite", size:13 },
];

export function StoreGameStage({
  segments,
  mascotState,
  onSpin,
  onSpinComplete,
  spinDone,
}: StoreGameStageProps) {
  return (
    <>
      <style>{CSS}</style>

      <div className="gstage">
        {/* Atmospheric lighting */}
        <div className="gstage-spot" />
        <div className="gstage-floor" />

        {/* Floating decorations */}
        {DECOS.map((d, i) => (
          <div
            key={i}
            className="gstage-deco"
            style={{ ...d.pos, fontSize: d.size, animation: d.anim }}
          >
            {d.emoji}
          </div>
        ))}

        {/* Stage content: bear + wheel */}
        <div className="gstage-body">
          <div className="gstage-bear">
            <FitZoneBearMascot state={mascotState} size="md" />
          </div>
          <div className="gstage-wheel">
            <PremiumSpinWheel
              segments={segments}
              onSpin={onSpin}
              onSpinComplete={onSpinComplete}
              disabled={spinDone}
            />
          </div>
        </div>
      </div>
    </>
  );
}
