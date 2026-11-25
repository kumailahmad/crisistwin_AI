import json
from playwright.sync_api import sync_playwright
B="http://localhost:3000"
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"]); errs=[]
    # --- demo mode (no backend login) can open emergency page
    c=b.new_context(viewport={"width":1440,"height":900}); d=c.new_page(); d.on("pageerror",lambda e:errs.append(str(e)))
    d.goto(B+"/login"); d.get_by_role("button",name="Continue in demo mode").click(); d.wait_for_url("**/dashboard"); d.wait_for_timeout(1500)
    print("dashboard emergency banner:", d.get_by_text("Emergency?").count()>0)
    d.get_by_role("link",name="Emergency Contacts").click(); d.wait_for_url("**/emergency"); d.wait_for_timeout(1500)
    print("helpline cards:", d.locator('a[href^="tel:"]').count(), "| Police 15 official badge:", d.get_by_text("Official source").count()>=1)
    print("1700 listed as Balochistan helpline:", d.get_by_text("1700").count()>0, "(only allowed inside the PDMA warning note)")
    print("hospital rows:", d.locator("tbody tr").count())
    d.select_option('select[aria-label="Filter by district"]',label="Quetta"); d.wait_for_timeout(400); print("Quetta rows:", d.locator("tbody tr").count())
    d.get_by_role("textbox",name="Search hospitals").fill("bolan"); d.wait_for_timeout(300); print("search 'bolan':", d.locator("tbody tr").count())
    d.screenshot(path="/home/claude/shots/emergency.png")
    # --- map place search with mocked Nominatim
    pg=b.new_page(viewport={"width":1440,"height":900}); pg.on("pageerror",lambda e:errs.append(str(e)))
    seen={}
    def fake(route):
        seen["url"]=route.request.url
        route.fulfill(status=200,content_type="application/json",headers={"access-control-allow-origin":"*"},body=json.dumps([{"place_id":1,"display_name":"Zarghoon Road, Quetta, Balochistan, Pakistan","lat":"30.1930","lon":"67.0100","boundingbox":["30.18","30.20","67.00","67.03"]}]))
    pg.route("https://nominatim.openstreetmap.org/**",fake)
    pg.goto(B+"/login"); pg.fill('input[type=email]',"admin@example.com"); pg.fill('input[autocomplete=current-password]',"Str0ng-pass-1"); pg.get_by_role("button",name="Sign in").click(); pg.wait_for_url("**/dashboard")
    pg.goto(B+"/map"); pg.wait_for_timeout(2500)
    pg.get_by_role("textbox",name="Find a place").fill("Zarghoon Road"); pg.get_by_role("button",name="Search",exact=True).click(); pg.wait_for_timeout(800)
    print("query bounded to Balochistan/Pakistan:", "countrycodes=pk" in seen.get("url","") and "bounded=1" in seen.get("url",""))
    pg.get_by_text("Zarghoon Road, Quetta, Balochistan, Pakistan").click(); pg.wait_for_timeout(2500)
    print("map focused (marker drawn, zoomed in):", pg.locator(".leaflet-zoom-animated path, canvas").count()>0)
    pg.screenshot(path="/home/claude/shots/map_search.png")
    print("page errors:", errs or "none"); b.close()
