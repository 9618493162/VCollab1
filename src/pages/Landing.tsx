import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
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
    index: "01",
    title: "Log a hi",
    body: "Who you greeted, a line worth remembering, and how much hi it was. Thirty seconds, done.",
  },
  {
    index: "02",
    title: "Watch the streak",
    body: "One hello a day keeps the streak alive. Quietly, gently motivating.",
  },
  {
    index: "03",
    title: "Look back",
    body: "A clean, chronological record of every person you've said hi to.",
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
              to={isAuthenticated ? "/dashboard" : "/auth"}
              className="font-medium text-foreground transition-opacity hover:opacity-60"
            >
              {isAuthenticated ? "Open journal" : "Sign in"}
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
          A tiny journal for tiny hellos
        </motion.p>

        <motion.h1
          {...fadeUp}
          transition={transition(0.15)}
          className="text-[clamp(4rem,19vw,15rem)] font-extralight leading-none tracking-[-0.05em]"
        >
          hiiiiii<span className="text-muted-foreground/70">.</span>
        </motion.h1>

        <motion.p
          {...fadeUp}
          transition={transition(0.25)}
          className="mt-10 max-w-md text-[15px] leading-7 text-muted-foreground"
        >
          Every hello, remembered. Log who you greeted and how much hi it was,
          and watch your streak grow — one small moment at a time.
        </motion.p>

        <motion.div
          {...fadeUp}
          transition={transition(0.35)}
          className="mt-12 flex flex-col items-center gap-4 sm:flex-row"
        >
          <Button asChild size="lg" className="h-12 rounded-full px-8">
            <Link to={primaryTarget}>
              Start saying hi
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
                key={step.index}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.6, delay: i * 0.08 }}
                className="grid grid-cols-[3.5rem_1fr] gap-6 border-t border-border py-10 sm:grid-cols-[5rem_12rem_1fr] sm:gap-10"
              >
                <span className="text-sm tabular-nums text-muted-foreground">
                  {step.index}
                </span>
                <h3 className="text-lg font-medium tracking-tight">
                  {step.title}
                </h3>
                <p className="text-sm leading-6 text-muted-foreground sm:col-span-1 col-span-2 -mt-1 sm:mt-0">
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
            <div className="mt-10 flex items-start justify-between gap-8">
              <div>
                <p className="text-base font-medium">Mom</p>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Called during lunch, just to check in.
                </p>
                <p className="mt-3 text-xs text-muted-foreground/70">
                  today · 12:41
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 pt-1.5">
                <span className="size-1.5 rounded-full bg-foreground" />
                <span className="size-1.5 rounded-full bg-foreground" />
                <span className="size-1.5 rounded-full bg-foreground" />
                <span className="size-1.5 rounded-full bg-border" />
                <span className="size-1.5 rounded-full bg-border" />
              </div>
            </div>
            <div className="mt-10 flex items-start justify-between gap-8 border-t border-border pt-8">
              <div>
                <p className="text-base font-medium">Sam, the barista</p>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  New place on 5th. Tried their oat latte.
                </p>
                <p className="mt-3 text-xs text-muted-foreground/70">
                  yesterday · 08:15
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 pt-1.5">
                <span className="size-1.5 rounded-full bg-foreground" />
                <span className="size-1.5 rounded-full bg-border" />
                <span className="size-1.5 rounded-full bg-border" />
                <span className="size-1.5 rounded-full bg-border" />
                <span className="size-1.5 rounded-full bg-border" />
              </div>
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
            Your first hi is waiting.
          </h2>
          <p className="mx-auto mt-6 max-w-sm text-sm leading-6 text-muted-foreground">
            No setup, no noise. Just a quiet place to keep every hello.
          </p>
          <Button
            asChild
            size="lg"
            className="mt-12 h-12 rounded-full px-10"
          >
            <Link to={primaryTarget}>
              Open your journal
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
            Say hi every day. Build a streak.
          </p>
        </div>
      </footer>
    </div>
  );
}
