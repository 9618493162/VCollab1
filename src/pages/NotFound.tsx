import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="aurora-blob absolute -top-32 right-1/4 size-[420px] rounded-full bg-indigo-600/20 blur-[130px]" />
        <div className="hero-grid absolute inset-0" />
      </div>

      <div className="relative z-10 flex items-center justify-between px-6 py-5">
        <Link to="/">
          <Logo />
        </Link>
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 text-center"
      >
        <p className="font-display text-7xl font-extrabold tracking-tight sm:text-8xl">
          <span className="text-gradient">404</span>
        </p>
        <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">
          This room doesn't exist.
        </h1>
        <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
          The page you're looking for was moved, ended, or never joined the
          meeting.
        </p>
        <Button asChild className="mt-8 rounded-full btn-glow">
          <Link to="/">
            Back home <ArrowRight className="ml-2 size-4" />
          </Link>
        </Button>
      </motion.div>
    </div>
  );
}
