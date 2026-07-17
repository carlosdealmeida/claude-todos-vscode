"""Varredura ampla de issues do anthropics/claude-code relevantes à extensão Claude Todos.

Usa a API pública (sem auth) com throttle de ~6.5s entre requests (limite 10/min).
Cada query pega os top-N por reações (abertas E fechadas — histórico completo).
Saída: JSON consolidado + tabela markdown, deduplicada contra issues já no ROADMAP.
"""
import json
import time
import urllib.request
import urllib.parse
import sys

REPO = "anthropics/claude-code"

# Issues já conhecidas/tratadas no ROADMAP.md (validação, entregues, descartadas)
KNOWN = {
    59195, 57019, 8723, 31243, 48741,          # validação de mercado
    61543, 58159, 516, 44779, 59900,            # itens 1-4
    28147, 24435, 23275,                        # item 5
    59412,                                      # item 6
    10366, 49095,                               # itens 7-8
    58044, 36949, 12808, 18814,                 # item 9
    60914, 64472, 58688, 35600,                 # i18n (item 12)
    34457, 59622, 59072,                        # R1
    56415, 46465, 11008, 47045, 64430,          # descartadas
}

# (rótulo, query) — todas com repo: e is:issue implícitos
QUERIES = [
    ("label vscode",        'label:platform:vscode'),
    ("label agent-view",    'label:area:agent-view'),
    ("label cost",          'label:area:cost'),
    ("label statusline",    'label:area:statusline'),
    ("todo (título)",       'todo in:title'),
    ("task list (título)",  '"task list" in:title'),
    ("task panel (título)", 'task panel in:title'),
    ("subagent (título)",   'subagent in:title'),
    ("sub-agent (título)",  '"sub-agent" in:title'),
    ("agent teams",         '"agent teams"'),
    ("teammate",            'teammate in:title'),
    ("token usage",         '"token usage" in:title'),
    ("context (título)",    'context in:title'),
    ("session (título)",    'session in:title'),
    ("transcript (título)", 'transcript in:title'),
    ("notification",        'notification in:title'),
    ("sidebar (título)",    'sidebar in:title'),
    ("dashboard (título)",  'dashboard in:title'),
    ("workflow (título)",   'workflow in:title'),
    ("background agent",    '"background agent"'),
    ("observability",       'observability'),
    ("usage (título)",      'usage in:title'),
    ("vscode recente",      'label:platform:vscode created:>2026-07-01'),
    ("agent tree",          '"agent tree" OR "mission control"'),
]

PER_PAGE = 30
SLEEP = 6.5

def fetch(query):
    q = urllib.parse.quote(f"repo:{REPO} is:issue {query}")
    url = (f"https://api.github.com/search/issues?q={q}"
           f"&sort=reactions&order=desc&per_page={PER_PAGE}")
    req = urllib.request.Request(url, headers={
        "Accept": "application/vnd.github+json",
        "User-Agent": "claude-todos-roadmap-sweep",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())

def main():
    seen = {}       # number -> item
    sources = {}    # number -> [labels de query]
    totals = {}     # query label -> total_count

    for i, (label, query) in enumerate(QUERIES):
        for attempt in range(3):
            try:
                data = fetch(query)
                break
            except Exception as e:
                print(f"  ! {label}: {e} (tentativa {attempt+1})", file=sys.stderr)
                time.sleep(30)
        else:
            totals[label] = -1
            continue
        totals[label] = data.get("total_count", 0)
        for it in data.get("items", []):
            n = it["number"]
            sources.setdefault(n, []).append(label)
            if n not in seen:
                seen[n] = {
                    "number": n,
                    "title": it["title"],
                    "state": it["state"],
                    "state_reason": it.get("state_reason"),
                    "labels": [l["name"] for l in it.get("labels", [])],
                    "reactions": it.get("reactions", {}).get("total_count", 0),
                    "plus1": it.get("reactions", {}).get("+1", 0),
                    "comments": it.get("comments", 0),
                    "created": it["created_at"][:10],
                }
        print(f"[{i+1}/{len(QUERIES)}] {label}: total={totals[label]}, novos até agora={len(seen)}")
        if i < len(QUERIES) - 1:
            time.sleep(SLEEP)

    fresh = [v for k, v in seen.items() if k not in KNOWN]
    fresh.sort(key=lambda x: (-x["reactions"], -x["comments"]))

    out = {
        "totals_por_query": totals,
        "total_unicos": len(seen),
        "ja_conhecidos": sorted(k for k in seen if k in KNOWN),
        "candidatos": fresh,
        "fontes": {str(k): v for k, v in sources.items() if k not in KNOWN},
    }
    with open("sweep_results.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"\n== {len(fresh)} candidatos novos (fora do ROADMAP), top 60 por reações ==")
    for it in fresh[:60]:
        sr = f"/{it['state_reason']}" if it["state_reason"] else ""
        labs = ",".join(it["labels"][:4])
        print(f"#{it['number']:>6} [{it['state']}{sr}] r={it['reactions']:<3} c={it['comments']:<3} "
              f"({it['created']}) {it['title'][:90]}  [{labs}]")

if __name__ == "__main__":
    main()
