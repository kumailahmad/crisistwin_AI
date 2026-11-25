import sys, json
from playwright.sync_api import sync_playwright
BASE="http://localhost:3000"
routes=["/dashboard","/map","/risk","/simulations","/resources","/assistant","/reports","/admin","/admin/districts","/admin/datasets","/admin/resources","/admin/scenarios","/admin/users","/admin/audit"]
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
    pg=b.new_page(viewport={"width":1440,"height":900})
    def on_console(m):
        if m.type=="error" and "tile" not in m.text.lower() and "ERR_" not in m.text and "Failed to load resource" not in m.text: errs.append((pg.url,m.text[:200]))
    pg.on("console",on_console); pg.on("pageerror",lambda e:errs.append((pg.url,"PAGEERROR "+str(e)[:200])))
    pg.goto(BASE+"/"); pg.wait_for_timeout(1500); pg.screenshot(path="/home/claude/shots/landing.png")
    pg.goto(BASE+"/login"); pg.fill('input[type=email]',"admin@example.com"); pg.fill('input[autocomplete=current-password]',"Str0ng-pass-1")
    pg.get_by_role("tab",name="Admin").click(); pg.get_by_role("button",name="Sign in").click()
    pg.wait_for_url("**/admin",timeout=15000); print("admin login ok ->",pg.url)
    for r in routes:
        pg.goto(BASE+r); pg.wait_for_timeout(2500)
        h=pg.locator("h1").first.inner_text() if pg.locator("h1").count() else "NO H1"
        body=pg.inner_text("body")
        bad=[k for k in ("Application error","Unhandled","Internal server error") if k in body]
        print(f"{r:22} h1={h!r:40} polygons={pg.locator('path.leaflet-interactive').count()} {bad or ''}")
        pg.screenshot(path=f"/home/claude/shots/{r.strip('/').replace('/','_')}.png")
    # interactive: map select district
    pg.goto(BASE+"/map"); pg.wait_for_timeout(2500)
    pg.get_by_role("button",name="Quetta").first.click(); pg.wait_for_timeout(1500)
    print("district panel shows Quetta:", pg.get_by_text("Quetta").count()>0)
    pg.screenshot(path="/home/claude/shots/map_selected.png")
    # risk flow
    pg.goto(BASE+"/risk"); pg.wait_for_timeout(1500)
    pg.select_option('select[aria-label=District]',label="Quetta")
    pg.fill('input[type=number] >> nth=0',"150"); pg.fill('input[type=number] >> nth=1',"1600"); pg.fill('input[type=number] >> nth=2',"4")
    pg.get_by_role("button",name="Calculate risk").click(); pg.wait_for_timeout(2000)
    print("risk result visible:", pg.get_by_text("Factor contributions").count()>0); pg.screenshot(path="/home/claude/shots/risk_result.png")
    pg.goto(BASE+"/map"); pg.wait_for_timeout(2500); pg.screenshot(path="/home/claude/shots/map_risk.png")
    # demo mode as fresh context
    c=b.new_context(viewport={"width":390,"height":800}); d=c.new_page(); d.on("pageerror",lambda e:errs.append(("demo","PAGEERROR "+str(e)[:200])))
    d.goto(BASE+"/dashboard"); d.wait_for_url("**/login**"); print("unauth redirect ok")
    d.get_by_role("button",name="Continue in demo mode").click(); d.wait_for_url("**/dashboard",timeout=10000); d.wait_for_timeout(2000)
    d.goto(BASE+"/admin"); d.wait_for_url("**/dashboard"); print("demo user blocked from admin ok")
    d.goto(BASE+"/risk"); d.wait_for_timeout(1500); d.select_option('select[aria-label=District]',label="Quetta")
    d.fill('input[type=number] >> nth=0',"90"); d.fill('input[type=number] >> nth=1',"1500"); d.get_by_role("button",name="Calculate risk").click(); d.wait_for_timeout(1500)
    print("demo risk ok:", d.get_by_text("Factor contributions").count()>0)
    d.goto(BASE+"/simulations"); d.wait_for_timeout(1500); d.select_option('select[aria-label=District]',label="Kech"); d.get_by_role("button",name="Run simulation").click(); d.wait_for_timeout(2500)
    print("demo sim ok:", d.get_by_text("Assumptions").count()>0); d.screenshot(path="/home/claude/shots/demo_sim_mobile.png")
    b.close()
print("CONSOLE/PAGE ERRORS:",json.dumps(errs,indent=1) if errs else "none")
