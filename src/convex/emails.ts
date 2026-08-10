"use node";

// Node-runtime module: sends transactional meeting emails through the built-in
// Vly email integration (VLY_INTEGRATION_KEY is injected automatically). All
// sends are best-effort — a missing key or failed request never breaks the
// meeting itself. The action receives everything it needs via scheduler args,
// so it never touches the database.
import { v } from "convex/values";
import { internalAction } from "./_generated/server";

const APP_URL =
  process.env.VLY_APP_URL ??
  process.env.CONVEX_SITE_URL ??
  "https://vcollab.app";

type MeetingEmail = {
  code: string;
  title: string;
  startTime: number;
  durationMinutes: number;
  description?: string;
};

/** Build the subject, text, and HTML for a meeting email. */
export function buildMeetingEmail(
  m: MeetingEmail,
  kind: "invite" | "reminder" | "cancelled",
): { subject: string; text: string; html: string } {
  const when = new Date(m.startTime).toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const link = `${APP_URL}/call/${m.code}`;
  const endsAt = new Date(
    m.startTime + m.durationMinutes * 60_000,
  ).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  const heading =
    kind === "invite"
      ? `You're invited: ${m.title}`
      : kind === "reminder"
        ? `Reminder: ${m.title} starts soon`
        : `Cancelled: ${m.title}`;

  const body = [
    kind === "cancelled"
      ? `${m.title} is no longer happening.`
      : kind === "reminder"
        ? `${m.title} starts in about 10 minutes.`
        : `You're invited to ${m.title}.`,
    `When: ${when} · ends around ${endsAt}`,
    m.description ? `About: ${m.description}` : "",
    `Meeting code: ${m.code}`,
    kind === "cancelled"
      ? "No action needed — the meeting code is no longer active."
      : `Join here: ${link}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const rows = [
    ["Title", m.title],
    ["When", `${when} · ends around ${endsAt}`],
    ["Code", m.code],
  ];
  if (m.description) rows.push(["About", m.description]);

  const actionLabel =
    kind === "cancelled" ? "Go to VCollab" : "Join meeting";
  const actionUrl = kind === "cancelled" ? `${APP_URL}/history` : link;

  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr>
            <td style="padding:28px 32px 8px;">
              <p style="margin:0;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#71717a;">VCollab</p>
              <h1 style="margin:8px 0 0;font-size:22px;line-height:1.3;color:#18181b;">${heading}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;">
              <p style="margin:0;font-size:14px;line-height:1.7;color:#3f3f46;white-space:pre-line;">${body}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:4px 32px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                ${rows
                  .map(
                    ([k, val]) => `
                  <tr>
                    <td style="padding:7px 0;font-size:12px;color:#a1a1aa;vertical-align:top;white-space:nowrap;width:70px;">${k}</td>
                    <td style="padding:7px 0;font-size:14px;color:#27272a;font-weight:500;">${val}</td>
                  </tr>`,
                  )
                  .join("")}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 32px;">
              <a href="${actionUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:999px;">${actionLabel}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;">Peer-to-peer meetings · nothing you say is recorded unless you record it.</p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject: heading, text: body, html };
}

/**
 * Send a meeting email (invite / reminder / cancelled) to every attendee.
 * Best-effort: skips silently when the integration key or attendees are
 * missing, and never throws for a failed send. All data is passed in via
 * scheduler args — no database access.
 */
export const sendMeetingEmail = internalAction({
  args: {
    code: v.string(),
    kind: v.union(v.literal("invite"), v.literal("reminder"), v.literal("cancelled")),
    title: v.string(),
    startTime: v.number(),
    durationMinutes: v.number(),
    description: v.optional(v.string()),
    attendees: v.array(v.string()),
  },
  handler: async (
    _ctx,
    { code, kind, title, startTime, durationMinutes, description, attendees },
  ) => {
    const to = attendees.filter((e) => e.trim() !== "");
    if (to.length === 0) return;

    // Graceful no-op when the platform email key isn't configured.
    if (!process.env.VLY_INTEGRATION_KEY) return;

    const { subject, text, html } = buildMeetingEmail(
      { code, title, startTime, durationMinutes, description },
      kind,
    );

    const { vly } = await import("../lib/vly-integrations");
    const result = await vly.email.sendBatch(
      to.map((addr) => ({ to: addr, subject, html, text })),
    );
    if (!result.success) {
      // eslint-disable-next-line no-console
      console.warn(`Meeting email (${kind}) failed: ${result.error ?? "unknown"}`);
    }
  },
});
