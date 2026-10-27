// Shared by the two admin pages (admin.html: courses; admin-people.html: accounts and teams).
export const $ = (s) => document.querySelector(s);
export const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fmtDate = (d) => d ? new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "TBA";
export const fmtWhen = (iso) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export function msg(el, text, kind) { el.textContent = text || ""; el.className = "msg" + (kind ? " " + kind : ""); }

/** Raw fetch to an admin endpoint (some return streams or PDFs, so callers read the body). */
export async function call(path, body) {
  const res = await fetch("/api/" + path, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin"
  });
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || "HTTP " + res.status); }
  return res;
}

/** Loads the planner data and shows the page only to admins. Returns the data. */
export async function adminGate() {
  let E;
  try {
    E = await window.loadPlannerData();
  } catch (e) {
    $("#lockMsg").innerHTML = e.needsLogin ? 'Please <a href="./">sign in to the planner</a> first, then come back here.' : esc(e.message);
    throw e;
  }
  if (E.me.user.role !== "admin") {
    $("#lockMsg").innerHTML = "Only the planner's admins can see this page. <a href=\"./\">Back to the planner</a>";
    throw new Error("not admin");
  }
  $("#lockCard").hidden = true;
  $("#adminBody").hidden = false;
  return E;
}
