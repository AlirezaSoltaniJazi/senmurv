import tempfile
from playwright.sync_api import sync_playwright

DIST = "/Users/alireza/WebstormProjects/senmurv/dist"

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        tempfile.mkdtemp(prefix="senmurv-debug3-"),
        headless=False,
        args=[f"--disable-extensions-except={DIST}", f"--load-extension={DIST}", "--no-first-run"],
    )
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker", timeout=15000)
    ext_id = sw.url.split("/")[2]
    panel = ctx.new_page()
    panel.set_viewport_size({"width": 900, "height": 900})
    panel.goto(f"chrome-extension://{ext_id}/src/sidepanel/index.html", wait_until="load")
    panel.wait_for_timeout(400)

    def send(msg):
        return panel.evaluate("async (m) => chrome.runtime.sendMessage(m)", msg)

    now = panel.evaluate("() => Date.now()")
    checklist_no_sub = {
        "id": "chk_verify_parent", "title": "Verify parent stop", "subtasks": [],
        "done": False, "deadline": None, "createdAt": now, "updatedAt": now,
    }
    print("SAVE_CHECKLIST:", send({"type": "SAVE_CHECKLIST", "payload": {"checklist": checklist_no_sub}}))
    running_parent_entry = {
        "id": "tsk_verify_parent", "title": "Verify parent stop", "tag": "",
        "intervals": [{"start": now - 5000, "end": None}], "stoppedAt": None,
        "createdAt": now - 5000, "updatedAt": now - 5000, "checklistId": "chk_verify_parent",
    }
    print("SAVE_TASK:", send({"type": "SAVE_TASK", "payload": {"entry": running_parent_entry}}))

    panel.get_by_role("button", name="My Tasks", exact=True).click()
    panel.wait_for_timeout(800)

    print("GET_TASKS (before click):", send({"type": "GET_TASKS"}))
    print("GET_CHECKLISTS (before click):", send({"type": "GET_CHECKLISTS"}))

    prow = panel.locator(".checklist-card", has=panel.locator(".checklist-title", has_text="Verify parent stop"))
    print("prow count:", prow.count())
    print("prow HTML:", prow.inner_html())

    ctx.close()
