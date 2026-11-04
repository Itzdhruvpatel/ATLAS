import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { useRef } from "react";
import Icon from "./Icons.jsx";

export const DOCK_ITEMS = [
  ["home", "Home", "#/", "home"],
  ["arena", "Arena", "#/arena", "arena"],
  ["scoreboard", "Scoreboard", "#/scoreboard", "chart"],
  ["scanner", "Scanner", "#/scanner", "shield"],
  ["paper", "Paper", "#/paper", "paper"],
];

function Item({ mouseX, label, href, icon, active, still }) {
  const ref = useRef(null);
  const distance = useTransform(mouseX, (x) => {
    const box = ref.current?.getBoundingClientRect();
    return box ? x - box.x - box.width / 2 : Infinity;
  });
  const size = useSpring(useTransform(distance, [-150, 0, 150], [50, still ? 50 : 78, 50]), { stiffness: 320, damping: 24, mass: 0.3 });
  return (
    <a ref={ref} href={href} aria-label={label} aria-current={active ? "page" : undefined} className="dock-item">
      <span className="dock-tip">{label}</span>
      <motion.span style={{ width: size, height: size }} className={`orb dock-orb${active ? " on" : ""}`}>
        <Icon name={icon} className="dock-icon" />
      </motion.span>
      <span className={`dock-dot${active ? " on" : ""}`} />
    </a>
  );
}

export default function Dock({ current }) {
  const mouseX = useMotionValue(Infinity);
  const still = useReducedMotion();
  return (
    <nav aria-label="Pages" className="dock-wrap">
      <div className="dock" onMouseMove={(e) => mouseX.set(e.clientX)} onMouseLeave={() => mouseX.set(Infinity)}>
        {DOCK_ITEMS.map(([key, label, href, icon], i) => (
          <div key={key} className="dock-slot">
            {i === 1 && <span className="dock-sep" aria-hidden="true" />}
            <Item mouseX={mouseX} label={label} href={href} icon={icon} active={current === key} still={still} />
          </div>
        ))}
      </div>
    </nav>
  );
}
