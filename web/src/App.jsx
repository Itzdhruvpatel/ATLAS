import { useEffect, useState } from "react";
import Arena from "./pages/Arena.jsx";
import Landing from "./pages/Landing.jsx";
import Paper from "./pages/Paper.jsx";
import Replay from "./pages/Replay.jsx";
import Scanner from "./pages/Scanner.jsx";
import Scoreboard from "./pages/Scoreboard.jsx";

const LINKS = [["#/arena", "Arena"], ["#/scoreboard", "Scoreboard"], ["#/scanner", "Scanner"], ["#/paper", "Paper"]];

function useRoute() {
  const [hash, setHash] = useState(location.hash || "#/");
  useEffect(() => {
    const change = () => { setHash(location.hash || "#/"); scrollTo(0, 0); };
    addEventListener("hashchange", change);
    return () => removeEventListener("hashchange", change);
  }, []);
  return hash;
}

function page(hash) {
  const [, name, id] = hash.split("/");
  if (name === "arena") return <Arena />;
  if (name === "replay" && id === "recording") return <Replay recordingIndex={Number(hash.split("/")[3] ?? 0)} />;
  if (name === "replay" && id) return <Replay id={id} />;
  if (name === "scoreboard") return <Scoreboard />;
  if (name === "scanner") return <Scanner />;
  if (name === "paper") return <Paper />;
  return <Landing />;
}

export default function App() {
  const hash = useRoute();
  useEffect(() => { document.getElementById("main")?.focus({ preventScroll: true }); }, [hash]);
  return (
    <>
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main").focus(); }}>Skip to content</a>
      <nav className="nav" aria-label="Main">
        <div className="wrap nav-inner">
          <a className="brand" href="#/">ATLAS</a>
          <div className="nav-links">
            {LINKS.map(([href, label]) => <a key={href} href={href} aria-current={hash.startsWith(href) ? "page" : undefined}>{label}</a>)}
          </div>
        </div>
      </nav>
      <main id="main" tabIndex={-1} style={{ outline: "none" }}>{page(hash)}</main>
      <footer className="footer">
        <div className="wrap">ATLAS is a research project. Everything in the arena is fake: the company, the secret, the email and the network.</div>
      </footer>
    </>
  );
}
