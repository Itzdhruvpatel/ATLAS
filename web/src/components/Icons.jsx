// Small line icons. 24px grid, stroke follows currentColor.
const P = {
  home: "M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z",
  arena: "M13 3 5 14h6l-1 7 8-11h-6z",
  chart: "M5 20V10M12 20V4M19 20v-7",
  shield: "M12 3 5 6v5.5c0 4.2 3 7.8 7 9.5 4-1.7 7-5.3 7-9.5V6zM8.8 12.2l2.2 2.2 4.4-4.6",
  paper: "M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5",
  arrow: "M7 17 17 7M9 7h8v8",
  down: "M12 5v14M6 13l6 6 6-6",
  doc: "M7 3h7l4 4v14H7zM14 3v4h4",
  lock: "M6.5 10.5h11a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1zM8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5",
  alert: "M12 4 2.8 19.5h18.4zM12 10v4.5M12 17.2v.3",
  pulse: "M4 12h2M8 8v8M12 5v14M16 9v6M20 11v2",
};

export default function Icon({ name, className = "icon" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={P[name]} />
    </svg>
  );
}
