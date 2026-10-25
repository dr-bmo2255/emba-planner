// Minimal GitHub REST helpers. Every change is one atomic commit (Git Data API), so any
// publish / remove / undo can itself be undone from the commit history.
export function gh(env) {
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH || "main";
  async function api(path, init = {}) {
    const res = await fetch("https://api.github.com/repos/" + repo + path, {
      ...init,
      headers: {
        "Authorization": "Bearer " + env.GITHUB_TOKEN,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "emba-planner-worker",
        ...(init.body ? { "Content-Type": "application/json" } : {})
      }
    });
    if (res.status === 404 && init.allow404) return null;
    if (!res.ok) throw new Error("GitHub " + (init.method || "GET") + " " + path + " → " + res.status + ": " + (await res.text()).slice(0, 300));
    return res.status === 204 ? null : res.json();
  }

  function decode(b64) {
    const bin = atob(b64.replace(/\n/g, ""));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }

  return {
    branch,
    /** File text at a ref, or null if it doesn't exist there. */
    async readFile(path, ref) {
      const r = await api("/contents/" + path + "?ref=" + encodeURIComponent(ref || branch), { allow404: true });
      return r ? decode(r.content) : null;
    },
    /** changes: [{ path, content }] or [{ path, delete: true }] → one commit. */
    async commit(changes, message) {
      const ref = await api("/git/ref/heads/" + branch);
      const head = ref.object.sha;
      const headCommit = await api("/git/commits/" + head);
      const tree = await api("/git/trees", {
        method: "POST",
        body: JSON.stringify({
          base_tree: headCommit.tree.sha,
          tree: changes.map((c) => c.delete
            ? { path: c.path, mode: "100644", type: "blob", sha: null }
            : { path: c.path, mode: "100644", type: "blob", content: c.content })
        })
      });
      const commit = await api("/git/commits", {
        method: "POST",
        body: JSON.stringify({ message, tree: tree.sha, parents: [head] })
      });
      await api("/git/refs/heads/" + branch, { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) });
      return { sha: commit.sha, url: commit.html_url };
    },
    async history(path, n) {
      const list = await api("/commits?sha=" + branch + "&path=" + encodeURIComponent(path) + "&per_page=" + (n || 15));
      return list.map((c) => ({ sha: c.sha, message: c.commit.message.split("\n")[0], date: c.commit.author.date, url: c.html_url }));
    },
    async commitInfo(sha) {
      const c = await api("/commits/" + sha);
      return { sha: c.sha, message: c.commit.message.split("\n")[0], parent: c.parents[0] && c.parents[0].sha, files: c.files.map((f) => ({ path: f.filename, status: f.status })) };
    }
  };
}
