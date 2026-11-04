import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import Icon from "../components/Icons.jsx";
import LayerLab from "../components/LayerLab.jsx";
import Readout, { Annunciators, prefersReducedMotion, usePlayer } from "../components/Readout.jsx";
import SkyWorld from "../components/SkyWorld.jsx";
import { recordings } from "../lib/api.js";
import { describe } from "../lib/replay.js";

const LEDGER = [
  ["9.3 / 10", "Severity score of EchoLeak, a flaw in Microsoft 365 Copilot. Reports describe a hidden prompt in an email that could pull out data with no click from the user.", "https://thehackernews.com/2025/06/zero-click-ai-vulnerability-exposes.html", "The Hacker News"],
  ["272,000", "Attack attempts by 464 people against 13 AI models, in a three-week public indirect prompt injection competition.", "https://arxiv.org/abs/2603.15714", "Dziemian et al., 2026"],
  ["Near 100%", "Attack success across all tested agents on a benchmark built from an earlier public red-teaming competition's successful attacks.", "https://arxiv.org/abs/2507.20526", "Zou et al., 2025"],
];

const LEVELS = [
  ["Open door", "No firewall. The agent trusts whatever it reads."],
  ["Clean room", "Hidden text, encoded blobs and lazy instructions are removed first."],
  ["Rulebook", "Tool calls are parsed. An address found only in your document can't be used."],
  ["Tripwire", "A fake secret sits next to the real one. If it moves, the call dies."],
  ["Full ATLAS", "Risky calls are replayed without your document. If they vanish, it caused them."],
];

const NAV = [["The problem", "problem"], ["The lab", "lab"], ["Levels", "levels"], ["Flight recorder", "recorder"]];

const scrollToId = (id) => document.getElementById(id)?.scrollIntoView();

function Reveal({ children, delay = 0, className = "" }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 46 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-12% 0px" }} transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1], delay }}>
      {children}
    </motion.div>
  );
}

// Every section floats over the one live landscape. A soft shade keeps its text readable over a bright sky.
const Section = ({ id, shade = "left", className = "", children }) => (
  <section id={id} className={`chapter ${className}`}>
    <div aria-hidden="true" className={`chapter-shade ${shade}`} />
    <div className="chapter-body">{children}</div>
  </section>
);

const Kicker = ({ n, children }) => <p className="kicker"><span className="tnum">{n}</span><span className="kicker-rule" />{children}</p>;

function useRecordedRun() {
  const [run, setRun] = useState(null);
  useEffect(() => {
    recordings().then((r) => setRun(r.runs.find((x) => x.featured) ?? r.runs[0] ?? null));
  }, []);
  return run;
}

function SessionCard({ run }) {
  const events = run.events;
  const last = events.length - 1;
  const [index, setIndex] = useState(prefersReducedMotion() ? last : 0);
  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const timer = setInterval(() => setIndex((i) => (i >= last + 4 ? 0 : i + 1)), 950);
    return () => clearInterval(timer);
  }, [last]);
  const shown = Math.min(index, last);
  const seen = events.slice(0, shown + 1);
  const finished = index >= last;
  const exposed = seen.some((e) => e.stage === "tool_result" && e.trust === "T3");
  const blocked = seen.find((e) => e.stage === "block");
  const state = finished && run.won ? "leak" : blocked ? "held" : exposed ? "warn" : "calm";
  const line = finished
    ? (run.won ? "The fake secret left the company." : run.blocked_by ? "The firewall stopped the document's instructions." : "The fake secret stayed inside.")
    : `${describe(events[shown]).head}.`;
  return (
    <motion.aside className="glass session-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 1 }}>
      <div className="session-top">
        <div>
          <p className="session-name">Agent reading: report</p>
          <p className="session-sub"><Icon name="doc" className="icon-sm" />{run.task}</p>
        </div>
        <span className={`orb session-orb ${state}`}><Icon name={state === "held" ? "lock" : state === "calm" ? "pulse" : "alert"} className="icon-sm" /></span>
      </div>
      <p className={`session-line ${state}`}>{line}</p>
      <Annunciators events={events} index={shown} level={run.level} won={run.won} />
      <p className="session-foot">{run.scripted ? "Recorded run. Real firewall code, scripted demo model." : `Recorded run on ${run.model}.`}</p>
    </motion.aside>
  );
}

function Hero({ run }) {
  return (
    <Section shade="left" className="hero">
      <header className="hero-nav">
        <a href="#/" className="hero-brand">ATLAS</a>
        <nav aria-label="Sections" className="hero-links">
          {NAV.map(([label, id]) => <button key={id} type="button" onClick={() => scrollToId(id)}>{label}</button>)}
        </nav>
        <a href="#/arena" className="ghost">Open arena</a>
      </header>
      <div className="hero-copy">
        <motion.p className="hero-tag" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 1, delay: 0.2 }}>
          <Icon name="shield" className="icon-sm" />A firewall for AI agents
        </motion.p>
        <motion.h1 initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.2, ease: [0.2, 0.8, 0.2, 1] }}>
          The PDF read<br /><em>your agent.</em>
        </motion.h1>
        <motion.p className="hero-lede" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.5 }}>
          AI agents can't tell your instructions from text they happen to read. ATLAS sits between the agent and its tools, and stops hidden instructions from turning into actions.
        </motion.p>
        <motion.div className="hero-actions" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.7 }}>
          <button type="button" className="solid" onClick={() => scrollToId("problem")}>Start the flight<Icon name="down" className="icon-sm" /></button>
          <a href="#/arena" className="ghost">Try to hijack it</a>
        </motion.div>
      </div>
      {run && <SessionCard run={run} />}
    </Section>
  );
}

function Recorder({ run }) {
  const player = usePlayer(run.events.length, false);
  return (
    <Section id="recorder" className="tall">
      <div className="chapter-wide pad-a">
        <Reveal><Kicker n="04">Flight recorder</Kicker></Reveal>
        <Reveal delay={0.1}><h2 className="title narrow">Every attack leaves a black box.</h2></Reveal>
        <Reveal delay={0.2}><p className="lead">Scrub through an attack one event at a time, see which layer acted, and share it with a link.</p></Reveal>
        <Reveal delay={0.25}>
          <Readout events={run.events} player={player} title={`Level ${run.level}: ${run.title.toLowerCase()}`}
            note={run.scripted ? "Scripted demo model, not a real LLM" : `Real run on ${run.model}`} />
        </Reveal>
      </div>
    </Section>
  );
}

export default function Landing() {
  const run = useRecordedRun();
  return (
    <div className="landing">
      <SkyWorld className="sky" />
      <main id="main" tabIndex={-1} style={{ outline: "none" }}>
        <Hero run={run} />

        <Section id="problem" shade="center" className="tall">
          <div className="chapter-wide pad-a center-head">
            <Reveal><Kicker n="01">The problem</Kicker></Reveal>
            <Reveal delay={0.1}><h2 className="title">No hacker in your network.<br /><em>Just a document.</em></h2></Reveal>
            <Reveal delay={0.2}><p className="lead">The victim only asked for a summary. Instructions hidden in what the agent reads do the rest, using the access you gave it.</p></Reveal>
            <dl className="ledger">
              {LEDGER.map(([number, text, href, source], i) => (
                <Reveal key={number} delay={0.15 * i} className="ledger-row">
                  <dt className="tnum">{number}</dt>
                  <dd>{text} <a href={href} target="_blank" rel="noreferrer">{source}</a></dd>
                </Reveal>
              ))}
            </dl>
          </div>
        </Section>

        <Section id="lab" className="tall">
          <div className="chapter-wide pad-a">
            <Reveal><Kicker n="02">The lab</Kicker></Reveal>
            <Reveal delay={0.1}><h2 className="title narrow">Turn the defenses off and see what breaks.</h2></Reveal>
            <Reveal delay={0.2}><p className="lead">The origin check stops an attacker's own address, but a customer address already in the database slips past it. Now switch on causal replay.</p></Reveal>
            <Reveal delay={0.25}><div className="glass lab-card"><LayerLab /></div></Reveal>
          </div>
        </Section>

        <Section id="levels" className="tall">
          <div className="chapter-wide pad-b">
            <Reveal><Kicker n="03">The arena</Kicker></Reveal>
            <Reveal delay={0.1}><h2 className="title narrow">Five levels. Beat them with your own words.</h2></Reveal>
            <ol className="levels-ladder">
              {LEVELS.map(([name, text], i) => (
                <Reveal key={name} delay={0.12 * i} className="level-col">
                  <span className="level-n tnum">{i + 1}</span>
                  <h3>{name}</h3>
                  <p>{text}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </Section>

        {run && <Recorder run={run} />}

        <Section id="install" shade="center" className="tall">
          <div className="chapter-mid pad-a center">
            <Reveal className="kicker-center"><Kicker n="05">Install</Kicker></Reveal>
            <Reveal delay={0.1}><h2 className="title mid">Add it with one line.</h2></Reveal>
            <Reveal delay={0.2}><p className="lead mid">ATLAS speaks the OpenAI API, so most agents only need a new base URL.</p></Reveal>
            <Reveal delay={0.25}>
              <pre className="code-card">{`client = OpenAI(
    base_url="https://your-atlas-gateway/v1",
    api_key=ATLAS_GATEWAY_KEY,
    default_headers={"X-Atlas-Session": session_id},
)`}</pre>
            </Reveal>
          </div>
        </Section>

        <Section id="limits" shade="center" className="finale">
          <div className="chapter-wide limits-grid">
            <Reveal><Kicker n="06">Honest limits</Kicker><h2 className="title small">Where it can be wrong</h2></Reveal>
            <ul className="limits-list">
              {[
                "If a model paraphrases a secret and sends it to an allowed address, text matching can miss it.",
                "An address in your own database counts as trusted, so an attacker can aim at one. Level 3 can be beaten this way.",
                "The replay check can block a legitimate task that depends on a document.",
                "No known defense stops all prompt injection. ATLAS lowers the odds and limits the damage.",
              ].map((text, i) => <Reveal key={text} delay={0.1 * i}><li>{text}</li></Reveal>)}
            </ul>
          </div>
          <div className="closing">
            <Reveal>
              <p className="closing-line">Get the secret out.</p>
              <a href="#/arena" className="closing-cta">Open the arena<span className="orb"><Icon name="arrow" className="icon-sm" /></span></a>
            </Reveal>
          </div>
        </Section>
      </main>
    </div>
  );
}
