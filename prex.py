import tempfile
from playwright.sync_api import sync_playwright
DIST="/Users/alireza/WebstormProjects/senmurv/dist"
with sync_playwright() as p:
    ctx=p.chromium.launch_persistent_context(tempfile.mkdtemp(),headless=False,
        args=[f"--disable-extensions-except={DIST}",f"--load-extension={DIST}","--no-first-run"])
    sw=ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker",timeout=15000)
    eid=sw.url.split("/")[2]
    fx=ctx.pages[0] if ctx.pages else ctx.new_page(); fx.goto("http://localhost:8899/fixture.html")
    panel=ctx.new_page(); panel.goto(f"chrome-extension://{eid}/src/sidepanel/index.html")
    panel.bring_to_front()   # panel is the ACTIVE tab, as in full-page mode
    for t in ("START_PICK","TOOL_PING","RUN_SCRIPT"):
        msg={"type":t} if t!="RUN_SCRIPT" else {"type":t,"payload":{"code":"1"}}
        print(f"  panel-active {t:12s} ->", panel.evaluate("async m=>chrome.runtime.sendMessage(m)",msg))
    ctx.close()
