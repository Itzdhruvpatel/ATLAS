export default function Paper() {
  return (
    <div className="page wrap">
      <h1 className="page-title">Can causal defenses be fooled by repeating the attack?</h1>
      <div className="prose">
        <p><strong>Status: in progress. There are no results yet, and this page will say so until there are.</strong></p>
        <h2>The idea</h2>
        <p>Some recent defenses remove one piece of untrusted text and check whether the risky action disappears. If it does, that text caused it. So what happens if an attacker puts the same instructions in two documents? Remove one and the other still works, so each can look innocent.</p>
        <h2>What will be tested</h2>
        <ol>
          <li>Repeated attacks succeed more often against leave-one-out checks than single attacks do.</li>
          <li>Removing suspect text in groups recovers most of that loss.</li>
          <li>Group removal's extra model calls and false blocks stay small enough to use.</li>
        </ol>
        <h2>How it will be measured</h2>
        <p>Attack and task success on a public benchmark and on the ATLAS suite, with each firewall layer switched on and off, an attacker who knows the defense, a test set frozen before final runs, and confidence intervals. These results could disprove the idea, and that gets published too.</p>
        <h2>Related work</h2>
        <p>This builds directly on CausalArmor, AttriGuard, AgentSentry and MELON. Whether any of them already handles repeated attacks hasn't been settled, and checking that comes first.</p>
      </div>
    </div>
  );
}
