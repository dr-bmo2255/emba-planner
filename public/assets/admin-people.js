// People & teams: admins only. Every account (who's active), who else is an admin, and every team.
import { $, esc, fmtDate, fmtWhen, msg, call, adminGate } from "./admin-common.js?v=2026-10-27d";

const E = await adminGate();

// ---------------------------------------------------------------- accounts + admins
let users = [];
async function loadUsers() {
  try {
    ({ users } = await (await call("admin/users")).json());
    renderUsers();
  } catch (e) { $("#userList").innerHTML = `<p class="msg err">${esc(e.message)}</p>`; }
}
function renderUsers() {
  const show = (document.querySelector("input[name=ushow]:checked") || {}).value || "all";
  const signedUp = users.filter((u) => !u.pending);
  $("#userCounts").textContent = `${signedUp.length} account${signedUp.length === 1 ? "" : "s"} · ${users.filter((u) => u.active).length} active · ${users.filter((u) => u.role === "admin").length} admin${users.filter((u) => u.role === "admin").length === 1 ? "" : "s"}`;
  const list = users.filter((u) => show === "all" || (show === "active" ? u.active : u.role === "admin"));
  const me = E.me.user.id;
  $("#userList").innerHTML = list.length ? list.map((u) => {
    const badges = (u.role === "admin" ? `<span class="ubadge admin">${u.owner ? "Owner" : "Admin"}</span>` : "") +
      (u.active ? '<span class="ubadge active">Active</span>' : "") + (u.pending ? '<span class="ubadge pending">Hasn\'t signed in yet</span>' : "");
    const facts = u.pending ? "Admin access waiting for their first sign-in" :
      `joined ${fmtDate(u.created_at.slice(0, 10))} · last sign-in ${u.last_sign_in ? fmtWhen(u.last_sign_in) : "never"} · ${u.done} item${u.done === 1 ? "" : "s"} checked off`;
    let btn = "";
    if (u.role === "admin" && !u.owner && u.id !== me) btn = `<button class="btn btn-danger btn-sm" data-role="student" data-uid="${u.id}" data-who="${esc(u.name || u.email)}">Remove admin</button>`;
    else if (u.role !== "admin") btn = `<button class="btn btn-ghost btn-sm" data-role="admin" data-uid="${u.id}" data-who="${esc(u.name || u.email)}">Make admin</button>`;
    return `<div class="crow urow" style="--c:${u.role === "admin" ? "#00356b" : "#c9d3df"}"><i class="sw"></i>
      <div class="cname"><b>${esc(u.name || u.email)}</b>${badges}<span style="display:block">${u.name ? esc(u.email) + " · " : ""}${esc(facts)}</span></div>${btn}</div>`;
  }).join("") : '<p class="muted">No accounts match.</p>';
}
document.querySelectorAll("input[name=ushow]").forEach((r) => r.addEventListener("change", renderUsers));
$("#userList").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-role]");
  if (!b) return;
  const making = b.dataset.role === "admin";
  if (!confirm(making ? `Make ${b.dataset.who} an admin?\n\nThey'll be able to add, edit, and remove course data for everyone, see all accounts, and add or remove other admins.`
    : `Remove admin access from ${b.dataset.who}? They keep their student account.`)) return;
  b.disabled = true;
  try { await call("admin/users/role", { userId: Number(b.dataset.uid), role: b.dataset.role }); loadUsers(); }
  catch (err) { b.disabled = false; alert(err.message); }
});
$("#addAdmin").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = e.target.email.value.trim().toLowerCase();
  if (!confirm(`Make ${email} an admin?\n\nThey'll be able to add, edit, and remove course data for everyone, see all accounts, and add or remove other admins.`)) return;
  try {
    const r = await (await call("admin/users/role", { email, role: "admin" })).json();
    msg($("#addAdminMsg"), r.created ? `Done. ${email} becomes an admin the first time they sign in.` : `Done. ${email} is now an admin.`, "ok");
    e.target.reset();
    loadUsers();
  } catch (err) { msg($("#addAdminMsg"), err.message, "err"); }
});

// ---------------------------------------------------------------- teams overview
async function loadTeams() {
  const { teams } = await (await call("admin/teams")).json();
  $("#teamList").innerHTML = teams.length ? teams.map((t) => `<div class="crow" style="--c:${esc(t.color)}"><i class="sw"></i>
    <div class="cname"><b>${esc(t.name)}</b><span>${t.members} member${t.members === 1 ? "" : "s"} · made by ${esc(t.owner_name || t.owner_email || "?")} · ${esc(fmtWhen(t.created_at))}</span></div>
    <button class="btn btn-danger btn-sm" data-team-del="${esc(t.id)}" data-name="${esc(t.name)}">Remove</button></div>`).join("") : '<p class="muted">No teams yet.</p>';
}
$("#teamList").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-team-del]");
  if (!b || !confirm(`Remove the team "${b.dataset.name}" and all its meetings for everyone? This can't be undone.`)) return;
  const res = await fetch("/api/teams/" + b.dataset.teamDel, { method: "DELETE", credentials: "same-origin" });
  if (!res.ok) alert("Couldn't remove it."); else loadTeams();
});

loadUsers(); loadTeams();
