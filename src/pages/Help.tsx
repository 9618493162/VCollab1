import { api } from "@/convex/_generated/api";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, CircleHelp, LifeBuoy, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

const FAQS: { q: string; a: string }[] = [
  {
    q: "How do I start or join a meeting?",
    a: "Click \"New meeting\" on your dashboard to create a room — a shareable code appears in the top bar. Anyone with that code can join from the landing page's \"Join\" field, no account needed on their side.",
  },
  {
    q: "Why can't I hear or see someone?",
    a: "Check the mute/camera buttons in the bottom bar, then your browser's permissions for mic and camera (the lock icon in the address bar). Calls are peer-to-peer, so a flaky network on either side can also cause dropped audio — try turning your camera off.",
  },
  {
    q: "How do polls, Q&A, and agenda work?",
    a: "Open the ⋮ (More) menu during a call. Hosts create and launch polls, moderate Q&A (pin/answer/remove), and run a live agenda. Participants see everything update in real time.",
  },
  {
    q: "What are breakout rooms?",
    a: "Hosts can split the call into smaller groups from ⋮ → Breakout rooms, assign participants, set a countdown, and bring everyone back to the main meeting when done.",
  },
  {
    q: "Can I schedule a meeting for later?",
    a: "Yes — Dashboard → Schedule. Pick a time, duration, invitees (they get email invites + reminders), and even a repeating schedule. Scheduled meetings appear on the Calendar and your History.",
  },
  {
    q: "What are workspaces and channels?",
    a: "Workspaces group your team: members, channels (#general, #engineering…), and roles (owner, admin, member, guest). Admins manage invites and roles from the workspace page or Admin console.",
  },
  {
    q: "Is my data stored securely?",
    a: "Auth and data live on Convex with per-user access checks on every query and mutation. Meeting data (notes, polls, recordings metadata, DMs) is scoped to the people involved.",
  },
  {
    q: "How do I export my data?",
    a: "History → \"Export data\" downloads a JSON archive of everything you own: meetings, notes, tasks, chat, files metadata, polls, Q&A, agenda, and more.",
  },
];

export default function Help() {
  const tickets = useQuery(api.support.listMyTickets);
  const submitTicket = useMutation(api.support.submitTicket);

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await submitTicket({ subject, message });
      toast.success("Request sent — we'll get back to you soon.");
      setSubject("");
      setMessage("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't send the request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AppHeader active="help" />
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20">
          <LifeBuoy className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Help center</h1>
          <p className="text-xs text-muted-foreground">
            Answers to common questions, plus a direct line to support.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* FAQ */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <CircleHelp className="size-4 text-muted-foreground" /> Frequently asked questions
          </h2>
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-left text-sm">{faq.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* Contact + tickets */}
        <section className="space-y-6">
          <div className="rounded-2xl border border-border/80 bg-card/50 p-5">
            <h2 className="mb-3 text-sm font-semibold">Contact support</h2>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ticket-subject">Subject</Label>
                <Input
                  id="ticket-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="What can we help with?"
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ticket-message">Details</Label>
                <textarea
                  id="ticket-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  maxLength={5000}
                  placeholder="Describe the issue — what you expected, what happened, and any error text."
                  className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-ring placeholder:text-muted-foreground focus-visible:ring-2"
                />
              </div>
              <Button
                className="w-full rounded-full"
                disabled={busy || subject.trim().length < 3 || message.trim().length < 10}
                onClick={() => void submit()}
              >
                <Send className="size-4" /> Send request
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border/80 bg-card/50 p-5">
            <h2 className="mb-3 text-sm font-semibold">Your requests</h2>
            {tickets === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No requests yet — we're here when you need us.
              </p>
            ) : (
              <ul className="space-y-2">
                {tickets.map((t) => (
                  <li key={t._id} className="rounded-xl border border-border/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{t.subject}</p>
                      <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium capitalize text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="size-3" /> {t.status}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.message}</p>
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      {formatDistanceToNow(t.createdAt, { addSuffix: true })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
      </div>
    </>
  );
}
