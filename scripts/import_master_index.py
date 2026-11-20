import openpyxl, json, datetime, re
p="/root/.claude/uploads/f07c6609-fb51-527e-b503-053abbbf3045/042b960b-Master_Index.xlsx"
wbv=openpyxl.load_workbook(p, data_only=True)
wbl=openpyxl.load_workbook(p)

MONTHS={1:"January",2:"February",3:"March",4:"April",5:"May",6:"June",7:"July",
        8:"August",9:"September",10:"October",11:"November",12:"December"}

def cell(c):
    if c is None: return ""
    if isinstance(c,(datetime.datetime,datetime.date)): return f"{MONTHS[c.month]} {c.year}"
    if isinstance(c,float) and c==int(c): return str(int(c))
    return re.sub(r'\s+',' ',str(c)).strip()

def iso(c):
    if c is None: return ""
    if isinstance(c,(datetime.datetime,datetime.date)): return c.strftime("%Y-%m-%d")
    s=re.sub(r'\s+',' ',str(c)).strip()
    m=re.match(r'^(\d{1,2})-([A-Za-z]{3})-(\d{4})$', s)
    if m:
        mon=["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].index(m.group(2).lower())+1
        return f"{m.group(3)}-{mon:02d}-{int(m.group(1)):02d}"
    return s

def link(sheet, row, col):
    c=wbl[sheet].cell(row=row, column=col)
    return c.hyperlink.target if (c.hyperlink and c.hyperlink.target) else ""

out={}

# Document Master Index -----------------------------------------------------
ws=wbv["Master Index"]; docs=[]
for i,r in enumerate(ws.iter_rows(min_row=3, max_row=ws.max_row, values_only=True), start=3):
    name=cell(r[1])
    if not name: continue
    docs.append({
        "serial": cell(r[0]), "name": name, "sharedBy": cell(r[2]), "format": cell(r[3]),
        "driveLink": link("Master Index", i, 5), "driveLabel": cell(r[4]),
        "sheetLink": link("Master Index", i, 6) or cell(r[5]),
        "status": cell(r[6]) or "Unconfirmed", "owner": cell(r[7]),
        "lastUpdated": iso(r[8]), "remarks": cell(r[9]),
    })
out["documents"]=docs

# Work Allocation -----------------------------------------------------------
ws=wbv["Work Allocation"]; wa=[]
for r in ws.iter_rows(min_row=6, max_row=ws.max_row, values_only=True):
    if not cell(r[0]): continue
    wa.append({"ref":cell(r[0]),"workstream":cell(r[1]),"task":cell(r[2]),
      "primaryOwner":cell(r[3]),"support":cell(r[4]),"stakeholder":cell(r[5]),
      "priority":cell(r[6]) or "Medium","status":cell(r[7]) or "Not Started",
      "dueDate":iso(r[8]),"sourceRef":cell(r[9]),"relatedDocument":cell(r[10]),
      "remarks":cell(r[11])})
out["work-allocation"]=wa

# Weekly Review -------------------------------------------------------------
ws=wbv["Weekly Review"]; wr=[]
for r in ws.iter_rows(min_row=6, max_row=ws.max_row, values_only=True):
    if not cell(r[1]): continue
    prog=cell(r[6])
    try: pct=str(round(float(prog)*100))
    except (ValueError,TypeError): pct=prog
    wr.append({"weekEnding":iso(r[0]),"member":cell(r[1]),"taskRef":cell(r[2]),
      "done":cell(r[5]),"progress":pct,"pending":cell(r[7]),"nextPlan":cell(r[8])})
out["weekly-review"]=wr

# Source Map ----------------------------------------------------------------
ws=wbv["Source Map"]; sm=[]
for r in ws.iter_rows(min_row=6, max_row=ws.max_row, values_only=True):
    if not cell(r[1]): continue
    sm.append({"source":cell(r[0]),"ref":cell(r[1]),"text":cell(r[2]),
      "taskRef":cell(r[3]),"alsoMapsTo":cell(r[5]),"note":cell(r[6])})
out["source-map"]=sm

# Programme Structure -------------------------------------------------------
ws=wbv["Sheet1"]; ps=[]
for r in ws.iter_rows(min_row=7, max_row=ws.max_row, values_only=True):
    vals=[cell(c) for c in r[1:7]]
    if not any(vals): continue
    ps.append({"area":vals[0],"programme":vals[1],"courses":vals[2],
               "faculty":vals[3],"tleps":vals[4],"students":vals[5]})
out["programme-structure"]=ps

def ts(v):
    return json.dumps(v, ensure_ascii=False)

lines=[]
lines.append("""/**
 * Register records imported from the team's Master Index workbook.
 *
 * GENERATED FILE — produced by scripts/import-master-index.mjs from
 * docs/source-data/Master_Index.xlsx. Edit the workbook and re-run the
 * importer rather than editing this file by hand.
 *
 * This is the starting content of the registers, not a fixed table: every
 * value here can be edited in the application, and both records and columns
 * can be added. Hyperlink targets are carried across from the workbook, so a
 * Drive link opens the same folder it opened in Excel.
 */

export interface SeedRecord {
  values: Record<string, string>
}

export const REGISTER_SEED_RECORDS: Record<string, SeedRecord[]> = {""")
for key, recs in out.items():
    lines.append(f"  {ts(key)}: [")
    for r in recs:
        pairs=", ".join(f"{ts(k)}: {ts(v)}" for k,v in r.items() if v!="")
        lines.append(f"    {{ values: {{ {pairs} }} }},")
    lines.append("  ],")
lines.append("}\n")
lines.append("/** Row counts at import time, asserted by the importer's test. */")
lines.append("export const REGISTER_SEED_COUNTS: Record<string, number> = "
             + ts({k: len(v) for k,v in out.items()}) + "\n")

open("registry-seed.ts","w").write("\n".join(lines))
print({k:len(v) for k,v in out.items()})
print(open("registry-seed.ts").read()[:1200])
