import { motion } from "framer-motion";
import { ArrowRight, MonitorUp, ShieldCheck, Users } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

const transition = (delay: number) => ({
  duration: 0.7,
  delay,
  ease: [0.22, 1, 0.36, 1] as const,
});

const steps = [
  {
    icon: Users,
    title: "Start a meeting",
    body: "One click gets you a shareable code — abc-defg-hij style. No signup for guests.",
  },
  {
    icon: MonitorUp,
    title: "Talk face to face",
    body: "Crisp peer-to-peer video straight from your browser. Mic, camera, and screen share, all on.",
  },
  {
    icon: ShieldCheck,
    title: "Nothing is stored",
    body: "Your words travel directly between participants. No recording, no retention, no noise.",
  },
];

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const primaryTarget = isAuthenticated ? "/dashboard" : "/auth";

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      {/* Nav */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <Link
            to="/"
            className="text-[15px] font-semibold tracking-tight text-foreground"
          >
            hiiiiii<span className="text-muted-foreground">.</span>
          </Link>
          <nav className="flex items-center gap-8 text-sm">
            <a
              href="#how"
              className="hidden text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              How it works
            </a>
            <Link
              to={primaryTarget}
              className="font-medium text-foreground transition-opacity hover:opacity-60"
            >
              {isAuthenticated ? "Meetings" : "Sign in"}
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center">
        <motion.p
          {...fadeUp}
          transition={transition(0.05)}
          className="mb-8 text-[11px] font-medium uppercase tracking-[0.3em] text-muted-foreground"
        >
          Video meetings, minus the fuss
        </motion.p>

        <motion.h1
          {...fadeUp}
          transition={transition(0.15)}
          className="text-[clamp(3rem,13vw,10rem)] font-extralight leading-none tracking-[-0.05em]"
        >
          say hi,
          <br />
          face to face<span className="text-muted-foreground/70">.</span>
        </motion.h1>

        <motion.p
          {...fadeUp}
          transition={transition(0.25)}
          className="mt-10 max-w-md text-[15px] leading-7 text-muted-foreground"
        >
          A quiet little meeting app. Start a call, share a code, and talk —
          peer-to-peer, right in your browser. Nothing is recorded or stored.
        </motion.p>

        <motion.div
          {...fadeUp}
          transition={transition(0.35)}
          className="mt-12 flex flex-col items-center gap-4 sm:flex-row"
        >
          <Button asChild size="lg" className="h-12 rounded-full px-8">
            <Link to={primaryTarget}>
              Start a meeting
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="lg"
            className="h-12 rounded-full px-8 text-muted-foreground hover:text-foreground"
          >
            <a href="#how">How it works</a>
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 1 }}
          className="absolute bottom-10 flex flex-col items-center gap-3"
        >
          <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground/60">
            keep going
          </span>
          <span className="h-10 w-px bg-border" />
        </motion.div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-24 px-6 pb-32 pt-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-14 border-t border-border pt-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-muted-foreground">
              How it works
            </p>
          </div>

          <div>
            {steps.map((step, i) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.6, delay: i * 0.08 }}
                className="grid grid-cols-[2.5rem_1fr] gap-6 border-t border-border py-10 sm:grid-cols-[3.5rem_14rem_1fr] sm:gap-10"
              >
                <step.icon className="mt-0.5 size-5 text-muted-foreground" />
                <h3 className="text-lg font-medium tracking-tight">
                  {step.title}
                </h3>
                <p className="col-span-2 -mt-1 text-sm leading-6 text-muted-foreground sm:col-span-1 sm:mt-0">
                  {step.body}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Example */}
      <section className="px-6 pb-32">
        <div className="mx-auto max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7 }}
            className="border border-border p-10 sm:p-14"
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-muted-foreground">
              It looks like this
            </p>
            <div className="mt-10 grid grid-cols-2 gap-4">
              <div className="flex aspect-video items-center justify-center rounded-xl bg-muted">
                <span className="text-sm text-muted-foreground">
                  You
                </span>
              </div>
              <div className="flex aspect-video items-center justify-center rounded-xl bg-muted">
                <span className="text-sm text-muted-foreground">
                  Sam
                </span>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-between border-t border-border pt-6">
              <p className="font-mono text-sm tracking-tight text-muted-foreground">
                abc-defg-hij
              </p>
              <p className="text-xs text-muted-foreground/70">
                in a call together · 12:41
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border px-6 py-32 text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
        >
          <h2 className="text-4xl font-extralight tracking-tight sm:text-5xl">
            Your next hello is a call away.
          </h2>
          <p className="mx-auto mt-6 max-w-sm text-sm leading-6 text-muted-foreground">
            No installs, no accounts for guests. Just a link and a wave.
          </p>
          <Button asChild size="lg" className="mt-12 h-12 rounded-full px-10">
            <Link to={primaryTarget}>
              Open your meetings
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-10">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm font-medium tracking-tight">
            hiiiiii<span className="text-muted-foreground">.</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Peer-to-peer. Private by default.
          </p>
        </div>
      </footer>
    </div>
  );
}
