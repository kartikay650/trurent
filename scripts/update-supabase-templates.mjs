// Switches Supabase from magic-link emails to OTP-only emails via the
// Supabase Management API. Run once with a PAT in env:
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/update-supabase-templates.mjs

import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split("=").map((s) => s.trim()))
    .filter(([k]) => k),
);

const pat = process.env.SUPABASE_ACCESS_TOKEN;
if (!pat) {
  console.error("Set SUPABASE_ACCESS_TOKEN in env.");
  process.exit(1);
}

const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1];

const OTP_TEMPLATE = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:480px;margin:auto;padding:32px 20px;background:#FAF7F2;border-radius:12px;">
  <p style="font-family:'Playfair Display',serif;font-size:22px;color:#1a1a1a;margin:0 0 4px;letter-spacing:-0.02em;">
    Tru<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#E8FF6A;vertical-align:middle;"></span>Rent
  </p>
  <h2 style="font-family:'Playfair Display',serif;font-weight:400;font-size:20px;color:#1a1a1a;margin:24px 0 12px;">Your sign-in code</h2>
  <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 24px;">Enter this 6-digit code on the listing page to verify your email.</p>
  <p style="font-family:'JetBrains Mono',Consolas,monospace;font-size:32px;font-weight:600;letter-spacing:10px;color:#1a1a1a;background:#fff;border:1px solid #e5e0d6;border-radius:8px;padding:18px;text-align:center;margin:0 0 24px;">{{ .Token }}</p>
  <p style="color:#888;font-size:12px;line-height:1.5;margin:0;">This code expires in 1 hour. If you didn't request it, you can safely ignore this email.</p>
</div>`;

const patch = {
  mailer_otp_length: 6,
  mailer_otp_exp: 3600,
  mailer_subjects_magic_link: "Your TruRent sign-in code",
  mailer_templates_magic_link_content: OTP_TEMPLATE,
  // Same template for the confirmation flow so new-user first-touch emails
  // also show the OTP rather than a link.
  mailer_subjects_confirmation: "Your TruRent sign-in code",
  mailer_templates_confirmation_content: OTP_TEMPLATE,
};

console.log("Patching Supabase auth config for project", ref, "...\n");
const res = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/config/auth`,
  {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${pat}`,
    },
    body: JSON.stringify(patch),
  },
);

if (!res.ok) {
  console.error("Update failed:", res.status, await res.text());
  process.exit(1);
}

const updated = await res.json();
console.log("Updated successfully.\n");
console.log("New values:");
console.log("  mailer_otp_length:", updated.mailer_otp_length);
console.log("  mailer_subjects_magic_link:", updated.mailer_subjects_magic_link);
console.log("  mailer_subjects_confirmation:", updated.mailer_subjects_confirmation);
console.log("  template body uses {{ .Token }}:",
  updated.mailer_templates_magic_link_content?.includes("{{ .Token }}"));
