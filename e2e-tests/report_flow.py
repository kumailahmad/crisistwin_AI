import io, json, urllib.request
from PIL import Image
from playwright.sync_api import sync_playwright
B="http://localhost:3000"; A="http://localhost:8000/api/v1"
def post(path, body):
    r=urllib.request.Request(A+path, json.dumps(body).encode(), {"Content-Type":"application/json"}); 
    try: return json.load(urllib.request.urlopen(r))
    except Exception as e: return None
post("/auth/register", {"email":"reporter@example.com","password":"password123","full_name":"Test Reporter"})
im=Image.new("RGB",(2800,2000),(150,110,80)); im.save("/tmp/evidence.jpg","JPEG",quality=90)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
    ctx=b.new_context(viewport={"width":1440,"height":900}, geolocation={"latitude":30.1798,"longitude":66.9750,"accuracy":18}, permissions=["geolocation"])
    pg=ctx.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.goto(B+"/login"); pg.fill('input[type=email]',"reporter@example.com"); pg.fill('input[autocomplete=current-password]',"password123"); pg.get_by_role("button",name="Sign in").click(); pg.wait_for_url("**/dashboard")
    print("dashboard report banner:", pg.get_by_text("See a flood").count()>0)
    pg.goto(B+"/report"); pg.wait_for_timeout(1500)
    pg.get_by_role("button",name="Submit report").click(); pg.wait_for_timeout(300)
    print("validation shown:", pg.get_by_text("Choose the location").count()>0 and pg.get_by_text("at least 10").count()>0)
    pg.get_by_role("button",name="Landslide / rockfall",exact=True).click(); pg.get_by_role("button",name="Critical").click()
    pg.get_by_label("Describe the situation").fill("Rocks have blocked the highway near the pass; two vehicles are stuck.")
    pg.get_by_role("button",name="Use my live location").click(); pg.wait_for_function("document.body.innerText.includes('Location found')",timeout=20000)
    print("gps pin set:", pg.get_by_text("Location found").count()>0, "|", pg.locator("text=/GPS ±/").count()>0)
    pg.locator('[data-testid=photo-input]').set_input_files("/tmp/evidence.jpg"); pg.wait_for_timeout(1500)
    print("photo preview:", pg.get_by_alt_text("Evidence photo 1").count()==1)
    pg.get_by_label("Landmark or address (optional)").fill("Near Bolan Pass"); pg.get_by_label("Your phone for follow-up (optional)").fill("+92 300 1234567")
    pg.screenshot(path="/home/claude/shots/report_form.png", full_page=True)
    pg.get_by_role("button",name="Submit report").click(); pg.wait_for_selector("[data-testid=ref-code]",timeout=15000)
    code=pg.locator("[data-testid=ref-code]").inner_text(); print("ref code:",code)
    pg.screenshot(path="/home/claude/shots/report_done.png")
    pg.wait_for_timeout(800); print("listed under your reports:", pg.get_by_text(code).count()>=2)
    # admin
    pa=ctx.new_page(); pa.goto(B+"/login"); 
    pa.evaluate("localStorage.clear()"); 
    ctx2=b.new_context(viewport={"width":1440,"height":900}); ad=ctx2.new_page(); ad.on("pageerror",lambda e:errs.append(str(e)))
    ad.goto(B+"/login"); ad.fill('input[type=email]',"admin@example.com"); ad.fill('input[autocomplete=current-password]',"Str0ng-pass-1"); ad.get_by_role("button",name="Sign in").click(); ad.wait_for_url("**/dashboard")
    ad.goto(B+"/admin/incidents"); ad.wait_for_timeout(1500); print("admin sees pending report:", ad.get_by_text(code).count()>0)
    ad.get_by_text(code).first.click(); ad.wait_for_timeout(1500)
    print("admin sees photo:", ad.locator("img[alt='Evidence photo']").count()==1)
    ad.screenshot(path="/home/claude/shots/admin_incident.png")
    ad.get_by_label("Note (shown to the reporter)").fill("Confirmed by NHA patrol."); ad.get_by_role("button",name="Verify").click(); ad.wait_for_timeout(1500)
    ad.goto(B+"/map"); ad.wait_for_timeout(3500); print("verified incident marker on map:", ad.locator(".inc-marker").count())
    ad.screenshot(path="/home/claude/shots/map_incident.png")
    pg.reload(); pg.wait_for_timeout(1500); print("reporter sees Verified:", pg.get_by_text("Verified by admin").count()>0)
    pg.goto(B+"/"); pg.wait_for_timeout(1500); pg.screenshot(path="/home/claude/shots/landing_mountains.png")
    pg2=ctx2.new_page(); pg2.goto(B+"/dashboard"); pg2.wait_for_timeout(2500); pg2.screenshot(path="/home/claude/shots/dashboard_new.png")
    pg.set_viewport_size({"width":390,"height":844}); pg.goto(B+"/report"); pg.wait_for_timeout(1500); pg.screenshot(path="/home/claude/shots/report_mobile.png", full_page=False)
    print("page errors:", errs or "none"); b.close()
