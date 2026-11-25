from playwright.sync_api import sync_playwright
B="http://localhost:3000"
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"]); pg=b.new_page(viewport={"width":1440,"height":900}); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.goto(B+"/login"); pg.fill('input[type=email]',"admin@example.com"); pg.fill('input[autocomplete=current-password]',"Str0ng-pass-1"); pg.get_by_role("button",name="Sign in").click(); pg.wait_for_url("**/dashboard"); pg.wait_for_timeout(2000)
    # command palette -> district on map
    pg.keyboard.press("Control+k"); pg.get_by_role("textbox",name="Quick search").fill("quet"); pg.wait_for_timeout(300); pg.keyboard.press("Enter"); pg.wait_for_url("**/map?district=Quetta"); pg.wait_for_timeout(2500)
    print("palette -> map with Quetta selected:", pg.get_by_role("heading",name="Quetta").count()>0)
    pg.screenshot(path="/home/claude/shots/map_quetta.png")
    print("labels render at zoom>=7:", pg.locator(".dist-label").count())
    # cache: second visit to /risk should show district options immediately
    pg.get_by_role("link",name="Risk Assessment").click(); pg.wait_for_url("**/risk")
    print("risk districts options immediately:", pg.locator('select[aria-label=District] option').count())
    # offline banner
    pg.route("**localhost:8000/**", lambda r: r.abort())
    pg.get_by_role("link",name="Reports").click(); pg.wait_for_timeout(3500)
    print("offline banner shown:", pg.get_by_text("Can’t reach the server").count()>0); pg.screenshot(path="/home/claude/shots/offline.png")
    print("skip link present:", pg.locator('a[href="#main"]').count()==1)
    print("errors:", errs or "none"); b.close()
