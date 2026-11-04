import { motion, MotionConfig, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import Dock, { DOCK_ITEMS } from "./components/Dock.jsx";
import Icon from "./components/Icons.jsx";
import { api } from "./lib/api.js";
import Arena from "./pages/Arena.jsx";
import Landing from "./pages/Landing.jsx";
import Paper from "./pages/Paper.jsx";
import Replay from "./pages/Replay.jsx";
import Scanner from "./pages/Scanner.jsx";
import Scoreboard from "./pages/Scoreboard.jsx";

function useRoute() {
  const [hash, setHash] = useState(location.hash || "#/");
  useEffect(() => {
    const change = () => { setHash(location.hash || "#/"); scrollTo(0, 0); };
    addEventListener("hashchange", change);
    return () => removeEventListener("hashchange", change);
  }, []);
  return hash;
}

function route(hash) {
  const [, name, id, index] = hash.split("/");
  if (name === "arena") return ["arena", "Arena", <Arena key="arena" />];
  if (name === "replay" && id === "recording") return ["arena", "Replay", <Replay key={hash} recordingIndex={Number(index ?? 0)} />];
  if (name === "replay" && id) return ["arena", "Replay", <Replay key={hash} id={id} />];
  if (name === "scoreboard") return ["scoreboard", "Scoreboard", <Scoreboard key="scoreboard" />];
  if (name === "scanner") return ["scanner", "Scanner", <Scanner key="scanner" />];
  if (name === "paper") return ["paper", "Paper", <Paper key="paper" />];
  return ["home", "", null];
}

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);
  return <span className="tnum">{now.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}&nbsp;&nbsp;{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>;
}

// Inner pages are one Mac app window on a wallpaper: menu bar, traffic lights, sidebar, content pane.
function AppWindow({ current, title, children }) {
  const still = useReducedMotion();
  const [online, setOnline] = useState(null);
  useEffect(() => {
    api.status().then(() => setOnline(true)).catch(() => setOnline(false));
  }, []);
  return (
    <div className="mac wallpaper">
      <header className="menubar">
        <a href="#/" className="menu-brand">ATLAS</a>
        <span className="menu-title">{title}</span>
        <span className="menu-right" aria-live="polite">
          <span className="menu-status"><span className={`dot ${online ? "good" : online === false ? "bad" : ""}`} />{online ? "Arena online" : online === false ? "Arena offline" : "Connecting"}</span>
          <Clock />
        </span>
      </header>
      <div className="window-wrap">
        <motion.div className="window" initial={still ? false : { opacity: 0, scale: 0.965, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 260, damping: 26 }}>
          <div className="titlebar">
            <div className="lights">
              <a href="#/" aria-label="Close, back to home" className="light red" />
              <span className="light yellow" aria-hidden="true" />
              <span className="light green" aria-hidden="true" />
            </div>
            <p className="window-title">{title}</p>
          </div>
          <div className="window-body">
            <aside className="sidebar">
              <p className="side-label">ATLAS</p>
              {DOCK_ITEMS.slice(1).map(([key, label, href, icon]) => (
                <a key={key} href={href} className="side-item" aria-current={current === key ? "page" : undefined}><Icon name={icon} className="side-icon" />{label}</a>
              ))}
              <div className="side-note">Everything in the arena is fake: the company, the secret, the email and the network.</div>
            </aside>
            <main id="main" tabIndex={-1} className="pane">
              <motion.div key={title} initial={still ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: "easeOut" }}>
                {children}
              </motion.div>
            </main>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default function App() {
  const hash = useRoute();
  const [current, title, page] = route(hash);
  return (
    <MotionConfig reducedMotion="user">
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
      {current === "home" ? <Landing /> : <AppWindow current={current} title={title}>{page}</AppWindow>}
      <Dock current={current} />
    </MotionConfig>
  );
}
