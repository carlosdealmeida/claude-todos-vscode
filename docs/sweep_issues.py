"""Varredura de issues do anthropics/claude-code relevantes à extensão Claude Todos.

Uso:
    python sweep_issues.py               # varredura completa (histórico inteiro)
    python sweep_issues.py 2026-07-25    # incremental: só issues criadas depois da data

Requer o `gh` CLI autenticado (`gh auth status`): o search autenticado permite 30 req/min,
contra 10/min anônimo. Cada query pega os top-N por reações (abertas E fechadas).
Saída: `sweep_results.json` + tabela no stdout, deduplicada contra o que já está no ROADMAP.

Nota de método: desde o lançamento do Fable 5 (jul/2026) o repositório é dominado por um
cluster de billing ("usage credits required") com as maiores contagens de reação do período e
zero relação com a extensão. O filtro NOISE abaixo remove esse cluster antes do ranqueamento —
sem ele, o que interessa fica enterrado.
"""
import io
import json
import re
import subprocess
import sys
import time

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

REPO = "anthropics/claude-code"

# Issues já conhecidas/tratadas no ROADMAP.md (validação, entregues, descartadas)
KNOWN = {
    # varredura inicial
    59195, 57019, 8723, 31243, 48741,           # validação de mercado
    61543, 58159, 516, 44779, 59900,            # itens 1-4
    28147, 24435, 23275,                        # item 5
    59412,                                      # item 6
    10366, 49095,                               # itens 7-8
    58044, 36949, 12808, 18814,                 # item 9
    60914, 64472, 58688, 35600,                 # i18n (item 12)
    34457, 59622, 59072,                        # R1
    56415, 46465, 11008, 47045, 64430,          # descartadas
    # varredura 2026-07-16
    18456, 73963, 24537, 22625, 54355,          # validação
    57230, 26581, 29928, 8985, 58243,           # validação (notificações, ordenação)
    2112,                                       # item 5 (session naming)
    28986, 76018, 77367, 76607, 62199,          # item 20
    75863, 67895, 74950, 66955, 67293,          # item 23
    74219, 33310,                               # item 23
    78147, 76218,                               # item 21
    24122, 24189, 24384, 24316, 33932,          # item 17 / descartadas
    # varredura 2026-07-25
    78327, 78324, 78555,                        # validação: l10n (item 12)
    79881, 80110, 79362,                        # validação: hook Notification (itens 14/22)
    79155, 81039, 78745, 78747,                 # validação: contexto (item 2)
    78595, 78960, 79281, 78692,                 # validação: diversos
    79078,                                      # item 22 (extensão: pergunta no painel)
    78867, 81198, 79109,                        # item 20 (reforço)
    80871, 80315, 78454,                        # item 21 (reforço)
    80099, 79571, 78466,                        # item 5 (reforço)
    79006, 79016, 78646, 79250, 79178,          # item 23 (reforço)
    78338, 78782,                               # item 23 (reforço)
    80210, 80015, 80401, 80129, 80160,          # R2
    80215, 80487, 79695, 79836, 80151,          # R2
    79298, 78821, 78578, 79122, 80434,          # R3
    80662, 80459, 80136, 78550, 78843, 78940,   # R3
    78449, 79042, 78825,                        # R4
    # varredura 2026-08-10
    83289, 83512, 82215, 83181, 84705,          # validação: statusline/usage por agente
    82766, 84028, 81801, 84368, 82603,          # validação: modelo/usage/pin/nome derivado
    84223, 81620, 84738, 81702, 83419,          # R5 (contabilidade de tokens)
    82084, 83019, 84279, 81946,                 # R3 (retenção 30 dias)
    83730, 85209, 83164, 83826,                 # R3 (índice perdido, dados intactos)
    83577, 84669, 81788, 84006, 82764,          # itens 14/22 (hook Notification)
    85534, 83848, 84981, 82617, 83627,          # item 23 (reforço)
    85129, 81270, 85161,                        # item 23 (reforço)
    82141, 82581, 85160,                        # item 21 (fontes de sessão)
    82641, 84040, 84540, 84556,                 # item 8 (grouping)
    81549,                                      # item 1 (viewer: timestamps)
}

# (rótulo, query) — todas com repo: e is:issue implícitos
QUERIES = [
    ("label vscode",        'label:platform:vscode'),
    ("label agent-view",    'label:area:agent-view'),
    ("label cost",          'label:area:cost'),
    ("label statusline",    'label:area:statusline'),
    ("label ide",           'label:area:ide'),
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
    ("background task",     '"background task" in:title'),
    ("observability",       'observability'),
    ("usage (título)",      'usage in:title'),
    ("agent tree",          '"agent tree" OR "mission control"'),
    ("jetbrains",           'jetbrains OR intellij in:title'),
    ("panel (título)",      'panel in:title'),
    ("modelo no vscode",    'model in:title label:platform:vscode'),
    ("extension (vscode)",  'extension in:title label:platform:vscode'),
]

# Cluster de billing do lançamento do Fable 5: alto volume, zero relação com a extensão.
NOISE = re.compile(r"usage credits|credits required|weekly (quota|allowance)|max plan|"
                   r"billed|billing|quota drain|usage limit|5-hour", re.I)

# Núcleo de escopo: o que a extensão pode ler do transcript ou exibir no painel.
CORE = re.compile(
    r"todowrite|taskcreate|taskupdate|tasklist|/todos|todo tool|"
    r"task (list|panel|view|store|id)|"
    r"transcript|\.jsonl|session file|session index|"
    r"subagent.*(model|notif|liveness|tree|view)|(model|notif|liveness).*subagent|"
    r"agent (tree|view|teams|hierarchy)|teammate|"
    r"notification hook|notify|toast|"
    r"sidebar|panel|dashboard|observab|"
    r"context (window|usage|percent)|token (usage|count)|"
    r"jetbrains|intellij|l10n|localiz|i18n|"
    r"background (task|agent|shell)|liveness|"
    r"session (name|picker|list|switch|resume|index)",
    re.I)

PER_PAGE = 40
SLEEP = 2.2  # autenticado: 30 req/min


def fetch(query, since):
    date_filter = f" created:>{since}" if since else ""
    q = f"repo:{REPO} is:issue{date_filter} {query}"
    out = subprocess.run(
        ["gh", "api", "-X", "GET", "search/issues",
         "-f", f"q={q}", "-f", "sort=reactions", "-f", "order=desc",
         "-f", f"per_page={PER_PAGE}"],
        capture_output=True, text=True, encoding="utf-8",
    )
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip()[:300])
    return json.loads(out.stdout)


def main():
    since = sys.argv[1] if len(sys.argv) > 1 else None
    print(f"Varredura de {REPO}" + (f" (created:>{since})" if since else " (histórico completo)"))

    seen, sources, totals = {}, {}, {}
    for i, (label, query) in enumerate(QUERIES):
        for attempt in range(3):
            try:
                data = fetch(query, since)
                break
            except Exception as e:
                print(f"  ! {label}: {e} (tentativa {attempt + 1})", file=sys.stderr)
                time.sleep(20)
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
                    "labels": [lbl["name"] for lbl in it.get("labels", [])],
                    "reactions": it.get("reactions", {}).get("total_count", 0),
                    "comments": it.get("comments", 0),
                    "created": it["created_at"][:10],
                    "body": (it.get("body") or "")[:600],
                }
        print(f"[{i + 1}/{len(QUERIES)}] {label}: total={totals[label]}, únicos={len(seen)}")
        if i < len(QUERIES) - 1:
            time.sleep(SLEEP)

    fresh = [v for k, v in seen.items() if k not in KNOWN]
    core = [it for it in fresh
            if CORE.search(it["title"] + " " + it["body"]) and not NOISE.search(it["title"])]
    core.sort(key=lambda x: (-x["reactions"], -x["comments"], x["number"]))

    with open("sweep_results.json", "w", encoding="utf-8") as f:
        json.dump({"totals_por_query": totals, "total_unicos": len(seen),
                   "ja_conhecidos": sorted(k for k in seen if k in KNOWN),
                   "candidatos": fresh, "no_nucleo": core,
                   "fontes": {str(k): v for k, v in sources.items() if k not in KNOWN}},
                  f, ensure_ascii=False, indent=2)

    print(f"\n== {len(fresh)} candidatos novos; {len(core)} no núcleo de escopo ==")
    for it in core[:80]:
        sr = f"/{it['state_reason']}" if it["state_reason"] else ""
        labs = ",".join(it["labels"][:4])
        print(f"#{it['number']:>6} [{it['state']}{sr}] r={it['reactions']:<3} "
              f"c={it['comments']:<3} ({it['created']}) {it['title'][:95]}  [{labs}]")


if __name__ == "__main__":
    main()
