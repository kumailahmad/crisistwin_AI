import json, urllib.request
from playwright.sync_api import sync_playwright
B="http://localhost:3000"
try: urllib.request.urlopen(urllib.request.Request("http://localhost:8000/api/v1/auth/register", json.dumps({"email":"reporter@example.com","password":"password123"}).encode(), {"Content-Type":"application/json"}))
except Exception: pass
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"]); errs=[]
    pg=b.new_page(viewport={"width":1440,"height":900}); pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.goto(B+"/login"); print("admin tab on public login:", pg.get_by_role("tab",name="Admin").count())
    pg.fill('input[type=email]',"admin@example.com"); pg.fill('input[autocomplete=current-password]',"Str0ng-pass-1"); pg.get_by_role("button",name="Sign in").click(); pg.wait_for_timeout(2000)
    print("admin rejected on public login:", pg.get_by_text("Incorrect email or password").count()>0, pg.url)
    pg.goto(B+"/staff-access"); pg.fill('input[type=email]',"reporter@example.com"); pg.fill('input[autocomplete=current-password]',"password123"); pg.get_by_role("button",name="Sign in").click(); pg.wait_for_timeout(2000)
    print("normal user rejected on staff page:", pg.get_by_text("Incorrect email or password").count()>0, pg.url)
    pg.fill('input[type=email]',"admin@example.com"); pg.fill('input[autocomplete=current-password]',"Str0ng-pass-1"); pg.get_by_role("button",name="Sign in").click(); pg.wait_for_url("**/admin",timeout=10000)
    print("admin reached /admin:", pg.url); pg.screenshot(path="/home/claude/shots/staff_ok.png")
    pg.goto(B+"/staff-access"); pg.wait_for_timeout(300)
    pu=b.new_page(viewport={"width":1440,"height":900}); pu.on("pageerror",lambda e:errs.append(str(e)))
    pu.goto(B+"/login"); pu.fill('input[type=email]',"reporter@example.com"); pu.fill('input[autocomplete=current-password]',"password123"); pu.get_by_role("button",name="Sign in").click(); pu.wait_for_url("**/dashboard")
    print("user nav has Admin Panel:", pu.get_by_role("link",name="Admin Panel").count()); pu.goto(B+"/admin"); pu.wait_for_timeout(1500); print("user /admin ->", pu.url)
    pu.goto(B+"/dashboard"); pu.wait_for_timeout(2500); pu.screenshot(path="/home/claude/shots/dash_friendly.png")
    pl=b.new_page(viewport={"width":1440,"height":900}); pl.goto(B+"/"); pl.wait_for_timeout(1000); pl.locator("#report").scroll_into_view_if_needed(); pl.wait_for_timeout(800); pl.screenshot(path="/home/claude/shots/landing_report.png")
    pl.locator("#safety").scroll_into_view_if_needed(); pl.wait_for_timeout(1200); pl.screenshot(path="/home/claude/shots/landing_safety.png")
    print("errors:", errs or "none"); b.close()
