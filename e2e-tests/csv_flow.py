from playwright.sync_api import sync_playwright
B="http://localhost:3000"
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"]); pg=b.new_page(viewport={"width":1440,"height":900}); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.goto(B+"/login"); pg.fill('input[type=email]',"admin@example.com"); pg.fill('input[autocomplete=current-password]',"Str0ng-pass-1"); pg.get_by_role("button",name="Sign in").click(); pg.wait_for_url("**/dashboard")
    pg.wait_for_timeout(2500); pg.screenshot(path="/home/claude/shots/dashboard2.png")
    pg.goto(B+"/admin/resources"); pg.get_by_role("button",name="Bulk import CSV").click()
    pg.set_input_files('input[aria-label="CSV file"]',"/tmp/bad.csv"); pg.wait_for_timeout(500)
    print("bad file flagged:", pg.get_by_text("with errors").count()>0, "| import disabled:", pg.get_by_role("button",name="Import resources").is_disabled()); pg.screenshot(path="/home/claude/shots/csv_bad.png")
    pg.set_input_files('input[aria-label="CSV file"]',"/tmp/good.csv"); pg.wait_for_timeout(500)
    print("good file:", pg.get_by_text("2 valid").count()>0); pg.get_by_role("button",name="Import 2 resources").click(); pg.wait_for_timeout(1500)
    print("rows listed:", pg.get_by_text("TEST Clinic A").count()>0 and pg.get_by_text("TEST Shelter B").count()>0)
    pg.goto(B+"/this-page-does-not-exist"); print("404 page:", pg.get_by_text("Page not found").count()>0)
    pg.goto(B+"/"); pg.wait_for_timeout(2500); pg.screenshot(path="/home/claude/shots/landing2.png", full_page=True)
    print("errors:", errs or "none"); b.close()
