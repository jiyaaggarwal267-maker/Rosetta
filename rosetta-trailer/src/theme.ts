import timeline from "./timeline.json";

export const T = timeline;
export const FPS = timeline.fps;

export const C = {
  void: "#05060B",
  navy: "#0B1020",
  violet: "#8B5CF6",
  violetSoft: "#A78BFA",
  cyan: "#22D3EE",
  text: "#F8FAFC",
  muted: "#94A3B8",
  crimson: "#EF4444",
  // Rosetta's real dark-theme UI tokens, for the recreated screens.
  ui: {
    abyss: "#0A1931",
    surface1: "#102642",
    surface2: "#142F4F",
    surface3: "#1A3A5E",
    steel: "#4A7FA7",
    mist: "#B3CFE5",
    paper: "#F6FAFD",
    text3: "#8098AF",
    ring: "rgba(179,207,229,0.14)",
    ringStrong: "rgba(179,207,229,0.24)",
    low: "#6FC2A0",
    medium: "#E6B85C",
    high: "#E8857E",
  },
};

export const F = {
  display: "Bricolage, 'Bricolage Grotesque', sans-serif",
  sans: "Geist, sans-serif",
  mono: "GeistMono, ui-monospace, monospace",
};

/** The six real Rosetta readers and their version of the sample round-robin commit. */
export const READERS = [
  {
    key: "engineer",
    label: "Engineer",
    tag: "Technical implementation",
    text: "Adds pickNextServer(): requests now cycle through servers[] with a modulo counter instead of always hitting servers[0].",
  },
  { key: "senior", label: "Senior developer", tag: "Patterns and risks", text: "Replaces the hard-coded upstream with a round-robin picker over a 3-server pool." },
  {
    key: "intern",
    label: "Intern",
    tag: "Learning walkthrough",
    text: "Requests used to go to one server. Now a small function picks the next one each time, so all three share the load.",
  },
  { key: "manager", label: "Manager", tag: "Impact and risks", text: "Traffic is now shared by 3 servers instead of 1." },
  { key: "client", label: "Client", tag: "Project progress", text: "Your website now runs on 3 machines sharing the work, so it stays fast when many people visit." },
  { key: "cmo", label: "CMO", tag: "Customer value", text: "The site can now take a much bigger crowd at once, so big campaign days won't slow it down." },
] as const;
