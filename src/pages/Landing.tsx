import { motion } from "framer-motion";
import {
  ArrowRight,
  Bot,
  Captions,
  ClipboardList,
  FileText,
  Globe2,
  KanbanSquare,
  Lock,
  Menu,
  MessageSquare,
  MicOff,
  MonitorUp,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
};

const transition = (delay: number) => ({
  duration: 0.7,
  delay,
  ease: [0.22, 1, 0.36, 1] as const,
});

const FEATURES = [
  { icon: Video, title: "HD video", body: "Crisp, low-latency peer-to-peer video that just works — straight from your browser." },
  { icon: MonitorUp, title: "Screen sharing", body: "Present a tab, window, or your whole screen with one click." },
  { icon: Sparkles, title: "AI meeting summaries", body: "Transcribe the call and get a clean summary with decisions and follow-ups." },
  { icon: MessageSquare, title: "Real-time chat", body: "A persistent chat with timestamps that stays with the meeting." },
  { icon: KanbanSquare, title: "Smart collaboration", body: "Shared notes and a Kanban board that keep the meeting moving." },
  { icon: ShieldCheck, title: "Secure meetings", body: "Lock rooms, kick intruders, and keep every meeting private by default." },
  { icon: Captions, title: "Live captions", body: "Real-time captions powered by your browser — no setup required." },
  { icon: Globe2, title: "Global collaboration", body: "Anyone with the link joins in seconds. No installs, no accounts for guests." },
];

const STEPS = [
  { n: "01", title: "Create or join a meeting", body: "One click starts a call with a shareable code like VC-7K4P-92X. Guests join from the link — no signup needed." },
  { n: "02", title: "Collaborate in real time", body: "Video, screen share, reactions, raise hand, chat, shared notes, and a live Kanban board — all in the same room." },
  { n: "03", title: "Get AI-powered insights", body: "Record the call and get a transcript, a summary, and action items — then ask the meeting questions afterwards." },
];

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "AI", href: "#ai" },
  { label: "Collaboration", href: "#collaboration" },
  { label: "Security", href: "#security" },
];

const HERO_TILES = [
  { name: "You", color: "from-indigo-500/30 to-violet-500/15", self: true },
  { name: "Aarav", color: "from-emerald-500/25 to-teal-500/10" },
  { name: "Maya", color: "from-amber-500/25 to-orange-500/10", speaking: true },
  { name: "Jon", color: "from-sky-500/25 to-blue-500/10" },
];

export default function Landing() {
  const { isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const primaryTarget = "/auth?mode=register";
  const signInTarget = "/auth?mode=signin";

  // Authenticated users opening the root route go straight to the dashboard
  // (requirement: logged out → landing page, logged in → /dashboard).
  if (!isLoading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const match = joinCode
      .toLowerCase()
      .match(/([a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3})/);
    if (!match) {
      toast.error("That doesn't look like a meeting code.");
      return;
    }
    navigate(`/call/${match[1]}`);
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground antialiased">
      {/* ---------- floating glass nav ---------- */}
      <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-6">
        <div className="glass-float depth-2 mx-auto flex h-14 max-w-6xl items-center justify-between rounded-full px-4 sm:px-5">
          <Link to="/" onClick={() => setMenuOpen(false)} className="shrink-0">
            <Logo />
          </Link>

          {/* desktop nav */}
          <nav className="hidden items-center gap-1 text-sm md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-full px-3.5 py-1.5 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <ThemeToggle />
            <Link
              to={signInTarget}
              className="press rounded-full border border-border/80 px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              Sign in
            </Link>
            <Link
              to={primaryTarget}
              className="press btn-glow rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-1.5 text-sm font-medium text-white transition-all hover:brightness-110"
            >
              Get started
            </Link>
          </div>

          {/* mobile controls */}
          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              className="press flex size-9 items-center justify-center rounded-full border border-border/60 text-foreground transition-colors hover:bg-muted"
            >
              {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
          </div>
        </div>

        {/* mobile menu */}
        <motion.div
          initial={false}
          animate={menuOpen ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: -8, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
          className={cn(
            "glass-float depth-3 mx-auto mt-2 max-w-6xl rounded-3xl p-2 md:hidden",
            !menuOpen && "pointer-events-none",
          )}
        >
          {menuOpen && (
            <nav className="flex flex-col gap-0.5">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-2xl px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {link.label}
                </a>
              ))}
              <div className="mt-2 flex flex-col gap-2 border-t border-border/60 pt-3">
                <Link
                  to={signInTarget}
                  onClick={() => setMenuOpen(false)}
                  className="flex h-11 items-center justify-center rounded-full border border-border/70 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  Sign in
                </Link>
                <Link
                  to={primaryTarget}
                  onClick={() => setMenuOpen(false)}
                  className="flex h-11 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 text-sm font-medium text-white shadow-md transition-all hover:brightness-110"
                >
                  Get started
                </Link>
              </div>
            </nav>
          )}
        </motion.div>
      </header>

      {/* ---------- hero ---------- */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 pt-28 text-center sm:px-6">
        {/* calm ambient background */}
        <div className="pointer-events-none absolute inset-0">
          <div className="aurora-blob absolute -top-32 left-1/4 h-[460px] w-[460px] rounded-full bg-indigo-500/20 blur-[130px]" />
          <div className="aurora-blob absolute -right-24 top-1/4 h-[400px] w-[400px] rounded-full bg-violet-500/15 blur-[130px]" style={{ animationDelay: "-6s" }} />
          <div className="aurora-blob absolute -bottom-40 left-1/3 h-[380px] w-[380px] rounded-full bg-sky-500/10 blur-[130px]" style={{ animationDelay: "-12s" }} />
          <div className="hero-grid absolute inset-0" />
        </div>

        <motion.p
          {...fadeUp}
          transition={transition(0.05)}
          className="glass-interactive relative mb-7 flex items-center gap-2 rounded-full px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.25em] text-primary"
        >
          <Zap className="size-3" /> Realtime video for teams
        </motion.p>

        <motion.h1
          {...fadeUp}
          transition={transition(0.15)}
          className="text-balance relative font-display text-[clamp(2.8rem,9vw,7rem)] font-extrabold leading-[1.02] tracking-tight"
        >
          Connect.
          <br />
          Collaborate.
          <br />
          <span className="text-gradient">Create.</span>
        </motion.h1>

        <motion.p
          {...fadeUp}
          transition={transition(0.25)}
          className="relative mt-8 max-w-xl text-[15px] leading-7 text-muted-foreground sm:text-base"
        >
          VCollab is a premium video collaboration platform — real peer-to-peer
          meetings, live captions, shared notes, Kanban boards, and AI
          summaries that write themselves. Private by default, effortless to
          share.
        </motion.p>

        <motion.div
          {...fadeUp}
          transition={transition(0.35)}
          className="relative mt-10 flex flex-col items-center gap-3 sm:flex-row"
        >
          <Button asChild size="lg" className="press h-12 w-full rounded-full px-8 btn-glow sm:w-auto">
            <Link to={primaryTarget}>
              Get started <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="press h-12 w-full rounded-full px-8 sm:w-auto"
          >
            <Link to={signInTarget}>Sign in</Link>
          </Button>
        </motion.div>

        {/* join input */}
        <motion.form
          {...fadeUp}
          transition={transition(0.45)}
          id="join"
          onSubmit={handleJoin}
          className="glass-float depth-2 relative mt-16 flex w-full max-w-md items-center gap-2 rounded-full p-1.5"
        >
          <Input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Enter a code or link — e.g. abc-defg-hij"
            className="h-11 flex-1 border-0 bg-transparent px-4 font-mono text-sm shadow-none focus-visible:ring-0"
          />
          <Button type="submit" className="press h-11 shrink-0 rounded-full px-5">
            Join <ArrowRight className="ml-1.5 size-4" />
          </Button>
        </motion.form>

        {/* animated meeting visual */}
        <motion.div
          initial={{ opacity: 0, y: 60, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.6, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="relative mt-20 w-full max-w-3xl"
          style={{ perspective: 1200 }}
        >
          <div
            className="glass-float depth-3 ring-gradient relative rounded-3xl p-3"
            style={{ transform: "rotateX(6deg)" }}
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {HERO_TILES.map((tile, i) => (
                <motion.div
                  key={tile.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8 + i * 0.12 }}
                  className={cn(
                    "relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br",
                    tile.color,
                    tile.speaking && "speaking-ring",
                  )}
                >
                  <span className="text-2xl font-extralight text-white/80">
                    {tile.name[0]}
                  </span>
                  <span className="absolute bottom-1.5 left-2 flex items-center gap-1 rounded-md bg-black/40 px-1.5 py-0.5 text-[10px] text-white/90 backdrop-blur-md">
                    {tile.name}
                    {tile.self && " (you)"}
                    {i === 2 && <MicOff className="size-2.5" />}
                  </span>
                  {tile.speaking && (
                    <span className="absolute right-1.5 top-1.5 rounded-md bg-primary/80 px-1.5 py-0.5 text-[9px] font-medium text-white">
                      speaking
                    </span>
                  )}
                </motion.div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between rounded-2xl bg-black/20 px-4 py-2.5 text-xs text-white/70 backdrop-blur-sm">
              <span className="font-mono tracking-tight">VC-7K4P-92X</span>
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                live · 12:41
              </span>
            </div>
          </div>

          {/* floating cards */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.2, duration: 0.8 }}
            className="glass-float depth-2 float-slow absolute -right-4 -top-8 hidden w-44 rounded-2xl p-3 sm:block"
          >
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
              <Sparkles className="size-3 text-primary" /> AI summary
            </p>
            <p className="mt-1.5 text-xs leading-5">
              "Launch beta testing next week…"
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.4, duration: 0.8 }}
            className="glass-float depth-2 float-slow absolute -bottom-10 -left-6 hidden w-40 rounded-2xl p-3 sm:block"
            style={{ animationDelay: "-3s" }}
          >
            <p className="text-[11px] font-semibold text-muted-foreground">Live captions</p>
            <p className="mt-1.5 text-xs italic leading-5">"…ship the onboarding flow this week."</p>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.8, duration: 1 }}
          className="relative mt-16 flex flex-col items-center gap-3"
        >
          <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground/60">
            keep going
          </span>
          <span className="h-10 w-px bg-gradient-to-b from-muted-foreground/50 to-transparent" />
        </motion.div>
      </section>

      {/* ---------- features ---------- */}
      <section id="features" className="relative scroll-mt-20 px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <motion.div
            {...fadeUp}
            whileInView={fadeUp.animate}
            viewport={{ once: true, margin: "-80px" }}
            className="text-center"
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-primary">
              Everything a meeting needs
            </p>
            <h2 className="text-balance mt-4 font-display text-4xl font-bold tracking-tight sm:text-5xl">
              One room, every tool.
            </h2>
          </motion.div>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: (i % 4) * 0.07 }}
                className="glass-float hover-lift press group rounded-2xl p-5"
              >
                <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/15 text-primary transition-transform group-hover:scale-110">
                  <f.icon className="size-5" />
                </div>
                <h3 className="mt-4 font-display text-base font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{f.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- how it works ---------- */}
      <section id="how" className="scroll-mt-20 border-t border-border/60 px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <motion.div
            {...fadeUp}
            whileInView={fadeUp.animate}
            viewport={{ once: true, margin: "-80px" }}
            className="text-center"
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-primary">
              How it works
            </p>
            <h2 className="text-balance mt-4 font-display text-4xl font-bold tracking-tight sm:text-5xl">
              From hello to summary in minutes.
            </h2>
          </motion.div>

          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.55, delay: i * 0.12 }}
                className="card-surface hover-lift relative overflow-hidden p-6"
              >
                <span className="font-display text-5xl font-extrabold text-gradient opacity-90">
                  {s.n}
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{s.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- AI ---------- */}
      <section id="ai" className="scroll-mt-20 px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <motion.div
            {...fadeUp}
            whileInView={fadeUp.animate}
            viewport={{ once: true, margin: "-80px" }}
            className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-indigo-950/60 via-background to-violet-950/40 p-8 sm:p-14"
          >
            <div className="aurora-blob pointer-events-none absolute -right-20 -top-24 size-96 rounded-full bg-primary/25 blur-[110px]" />
            <div className="relative grid items-center gap-10 lg:grid-cols-2">
              <div>
                <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.3em] text-primary">
                  <Sparkles className="size-3.5" /> AI-native
                </p>
                <h2 className="text-balance mt-4 font-display text-4xl font-bold tracking-tight sm:text-5xl">
                  Your meeting, <span className="text-gradient">already summarized</span>.
                </h2>
                <p className="mt-5 max-w-md text-[15px] leading-7 text-muted-foreground">
                  Record the call and VCollab transcribes it with speaker
                  labels, distills the summary, extracts action items, and lets
                  you ask the meeting anything afterwards.
                </p>
                <ul className="mt-7 space-y-3 text-sm">
                  {[
                    ["Captions", "Live captions in the call, powered by your browser."],
                    ["Transcript", "Speaker-labeled transcription via AssemblyAI."],
                    ["Summary & action items", "Overview, decisions, and follow-ups via OpenAI."],
                    ["Meeting assistant", "Ask questions — answers are grounded in the actual transcript."],
                  ].map(([title, body]) => (
                    <li key={title} className="flex items-start gap-3">
                      <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
                        <CheckIcon />
                      </span>
                      <span>
                        <span className="font-medium">{title}</span>
                        <span className="text-muted-foreground"> — {body}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* mock summary panel */}
              <div className="glass-float depth-2 rounded-2xl p-5">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <Bot className="size-3.5 text-primary" /> Meeting assistant
                </p>
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl rounded-bl-sm bg-primary/15 px-3.5 py-2.5 text-sm">
                    What did we decide about the database?
                  </div>
                  <div className="rounded-2xl rounded-tl-sm bg-muted/70 px-3.5 py-2.5 text-sm leading-6">
                    <p>
                      The team agreed to use Convex with a "by_code" index for
                      presence queries. <span className="text-primary font-medium">Decision:</span>{" "}
                      migration lands before Friday.
                    </p>
                  </div>
                  <div className="rounded-2xl rounded-tl-sm bg-muted/70 px-3.5 py-2.5 text-sm leading-6">
                    <p>
                      <span className="text-primary font-medium">Action items:</span>
                    </p>
                    <ul className="mt-1 space-y-1">
                      <li>• Maya — prepare the testing report</li>
                      <li>• Aarav — update the documentation</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ---------- collaboration ---------- */}
      <section id="collaboration" className="scroll-mt-20 border-t border-border/60 px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <motion.div
            {...fadeUp}
            whileInView={fadeUp.animate}
            viewport={{ once: true, margin: "-80px" }}
            className="text-center"
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-primary">
              Collaboration
            </p>
            <h2 className="text-balance mt-4 font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Meetings don't end when the call does.
            </h2>
          </motion.div>
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: FileText, title: "Shared notes", body: "One live document per meeting, autosaved as you type." },
              { icon: KanbanSquare, title: "Kanban board", body: "To Do → Done with drag & drop, assignees, and due dates." },
              { icon: ClipboardList, title: "Meeting history", body: "Every meeting archived with its code, status, and AI artifacts." },
              { icon: MessageSquare, title: "Persistent chat", body: "Messages are stored with the meeting, not lost when you close the tab." },
            ].map((c, i) => (
              <motion.div
                key={c.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="glass-float hover-lift press rounded-2xl p-5"
              >
                <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/15 to-violet-500/10 text-primary">
                  <c.icon className="size-5" />
                </div>
                <h3 className="mt-4 font-display text-base font-semibold">{c.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{c.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- security ---------- */}
      <section id="security" className="scroll-mt-20 border-t border-border/60 px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <motion.div
            {...fadeUp}
            whileInView={fadeUp.animate}
            viewport={{ once: true, margin: "-80px" }}
            className="grid items-center gap-10 lg:grid-cols-2"
          >
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-primary">
                Security
              </p>
              <h2 className="text-balance mt-4 font-display text-4xl font-bold tracking-tight">
                Private by default.
              </h2>
              <p className="mt-5 max-w-md text-[15px] leading-7 text-muted-foreground">
                Media flows peer-to-peer — it never touches a server. Meetings
                are gated by a code, hosts can lock rooms and remove
                participants, and nothing is recorded unless you press record.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { icon: ShieldCheck, t: "Protected meetings", d: "Host-only controls for lock, mute, and remove." },
                { icon: Lock, t: "Encrypted where it counts", d: "WebRTC's DTLS-SRTP secures every media stream." },
                { icon: Users, t: "Private rooms", d: "Rooms exist only when you share the code." },
                { icon: Video, t: "No retention", d: "Video and audio are never stored by default." },
              ].map((s) => (
                <div key={s.t} className="glass-float flex items-start gap-3 rounded-2xl p-4">
                  <s.icon className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>
                    <span className="block text-sm font-medium">{s.t}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                      {s.d}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ---------- final CTA ---------- */}
      <section className="relative overflow-hidden border-t border-border/60 px-4 py-28 text-center sm:px-6">
        <div className="aurora-blob pointer-events-none absolute left-1/2 top-1/2 size-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-indigo-600/20 to-fuchsia-500/15 blur-[130px]" />
        <motion.div
          {...fadeUp}
          whileInView={fadeUp.animate}
          viewport={{ once: true, margin: "-80px" }}
          className="relative"
        >
          <h2 className="text-balance font-display text-4xl font-bold tracking-tight sm:text-6xl">
            Start collaborating <span className="text-gradient">smarter</span>.
          </h2>
          <p className="mx-auto mt-6 max-w-md text-[15px] leading-7 text-muted-foreground">
            No installs, no accounts for guests. Just a link, a wave, and AI
            that does the note-taking.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="press h-13 rounded-full px-10 py-4 btn-glow">
              <Link to={primaryTarget}>
                Get started <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="press h-13 rounded-full px-10 py-4"
            >
              <Link to={signInTarget}>Sign in</Link>
            </Button>
          </div>
        </motion.div>
      </section>

      {/* ---------- footer ---------- */}
      <footer className="border-t border-border/60 px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <Logo />
          <p className="text-xs text-muted-foreground">
            Peer-to-peer video · AI summaries · Private by default
          </p>
        </div>
      </footer>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="size-3">
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
