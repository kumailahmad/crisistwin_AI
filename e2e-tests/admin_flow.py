from playwright.sync_api import sync_playwright
B="http://localhost:3000"
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"]); pg=b.new_page(viewport={"width":1440,"height":900})
    errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.goto(B+"/login"); pg.fill('input[type=email]',"admin@example.com"); pg.fill('input[autocomplete=current-password]',"Str0ng-pass-1"); pg.get_by_role("button",name="Sign in").click(); pg.wait_for_url("**/dashboard")
    # dataset
    pg.goto(B+"/admin/datasets"); pg.get_by_role("button",name="Add dataset").click()
    pg.get_by_label("Name").fill("geoBoundaries PAK ADM2"); pg.get_by_label("Source / URL / citation").fill("github.com/wmgeolab/geoBoundaries (CC BY 4.0)"); pg.get_by_role("button",name="Save",exact=True).click(); pg.wait_for_timeout(1200)
    print("dataset listed:", pg.get_by_text("geoBoundaries PAK ADM2").count()>0)
    # resource with bad coords then good (sample record, clearly labelled unverified)
    pg.goto(B+"/admin/resources"); pg.get_by_role("button",name="Add resource").click()
    pg.get_by_label("Name").fill("TEST sample facility (delete me)"); pg.get_by_label("Latitude").fill("10"); pg.get_by_label("Longitude").fill("66")
    print("bad-lat validation shown:", pg.get_by_text("Latitude must be").count()>0, "| save disabled:", pg.get_by_role("button",name="Save",exact=True).is_disabled())
    pg.get_by_label("Latitude").fill("30.19"); pg.get_by_label("Longitude").fill("67.0"); pg.get_by_label("Source (required)").fill("e2e test"); pg.get_by_role("button",name="Save",exact=True).click(); pg.wait_for_timeout(1200)
    print("resource listed:", pg.get_by_text("TEST sample facility").count()>0)
    pg.goto(B+"/map"); pg.wait_for_timeout(3000); print("marker on map:", pg.locator(".res-marker").count())
    pg.screenshot(path="/home/claude/shots/map_marker.png")
    pg.goto(B+"/admin/resources"); pg.wait_for_timeout(1000); pg.get_by_role("row").nth(1).get_by_role("button").nth(1).click()
    print("confirm dialog:", pg.get_by_role("dialog").count()>0); pg.get_by_role("button",name="Delete").click(); pg.wait_for_timeout(1200)
    print("deleted:", pg.get_by_text("TEST sample facility").count()==0)
    pg.goto(B+"/admin/audit"); pg.wait_for_timeout(1200); print("audit has create/delete:", pg.get_by_text("delete").count()>0 and pg.get_by_text("create").count()>0)
    print("page errors:", errs or "none"); b.close()
