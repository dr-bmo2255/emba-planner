// Sends the sign-in code. EMAIL_MODE=log (local development) just prints it; EMAIL_MODE=resend
// uses Resend (https://resend.com) with RESEND_API_KEY and a verified EMAIL_FROM domain.
export async function sendLoginCode(env, email, code) {
  const subject = code + " is your EMBA Planner sign-in code (unofficial student tool)";
  const text = `Your EMBA Planner sign-in code is ${code}\n\nIt expires in 10 minutes. If you didn't ask for it, you can ignore this email.\n\n(EMBA Planner is an unofficial student tool for the Yale SOM EMBA Class of 2028.)`;
  if (env.EMAIL_MODE !== "resend") {
    console.log(`[email:log] to=${email} subject="${subject}"`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [email],
      subject,
      text,
      html: `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#1b2430">
        <p>Your <b>EMBA Planner</b> sign-in code is</p>
        <p style="font-size:30px;font-weight:700;letter-spacing:6px;color:#00356b;margin:12px 0">${code}</p>
        <p style="color:#4a5566">It expires in 10 minutes. If you didn't ask for it, you can ignore this email.</p>
        <p style="color:#7b8696;font-size:12px">EMBA Planner is an unofficial student tool for the Yale SOM EMBA Class of 2028.</p></div>`
    })
  });
  if (!res.ok) throw new Error("Couldn't send the sign-in email (" + res.status + ").");
}
