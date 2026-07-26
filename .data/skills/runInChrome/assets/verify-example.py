"""Full manual-QA pass against the real extension in Chrome."""

import json
import sys
import tempfile
from playwright.sync_api import sync_playwright

DIST = "/Users/alireza/WebstormProjects/senmurv/dist"
FIXTURE = "http://localhost:8899/fixture.html"
OPTS_DEFAULT = {
    "shouldEnableInputs": True,
    "shouldDropValidation": True,
    "shouldUnlockOptions": True,
    "shouldRevealHidden": False,
    "shouldRevealPasswords": False,
    "shouldCloseDialogs": False,
    "shouldPierceShadowDom": False,
}
OPTS_ALL = {**OPTS_DEFAULT, **{k: True for k in OPTS_DEFAULT}}

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))


with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        tempfile.mkdtemp(prefix="senmurv-verify-"),
        headless=False,
        args=[f"--disable-extensions-except={DIST}", f"--load-extension={DIST}", "--no-first-run"],
    )
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker", timeout=15000)
    ext_id = sw.url.split("/")[2]

    fixture = ctx.pages[0] if ctx.pages else ctx.new_page()
    page_errors = []
    fixture.on(
        "console",
        lambda m: page_errors.append(m.location.get("url", "")) if m.type == "error" else None,
    )
    fixture.goto(FIXTURE, wait_until="load")

    panel = ctx.new_page()
    panel.goto(f"chrome-extension://{ext_id}/src/sidepanel/index.html", wait_until="load")
    panel.evaluate("""() => {
        window.__events = [];
        chrome.runtime.onMessage.addListener((m) => { window.__events.push(m); });
    }""")
    fixture.bring_to_front()

    def send(msg):
        return panel.evaluate(
            "async (m) => { try { return await chrome.runtime.sendMessage(m); }"
            "catch (e) { return { ok:false, error:String(e) }; } }", msg)

    def events(kind):
        return panel.evaluate("(k) => window.__events.filter(e => e.type === k)", kind)

    def clear_events():
        panel.evaluate("() => { window.__events = []; }")

    def attrs(sel):
        return fixture.evaluate(
            "(s) => { const el = document.querySelector(s); return el ? Object.fromEntries("
            "[...el.attributes].map(a => [a.name, a.value])) : null; }", sel)

    def overlay_present():
        return fixture.evaluate("() => !!document.querySelector('senmurv-picker-overlay')")

    # ======================= (1) PICKER REGRESSIONS =========================
    print("\n=== (1) picker regressions ===")

    box = fixture.locator("#picktarget").bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2

    clear_events()
    check("START_PICK accepted", send({"type": "START_PICK"}).get("ok") is True)
    fixture.mouse.move(cx, cy)
    fixture.wait_for_timeout(150)
    check("hover creates the shadow overlay", overlay_present())

    fixture.mouse.click(cx, cy)
    fixture.wait_for_timeout(300)
    picked = events("ELEMENT_PICKED")
    ok = len(picked) == 1 and picked[0]["payload"]["element"]["tagName"] == "button"
    check("click reports ELEMENT_PICKED", ok, json.dumps(picked[0]["payload"]["element"]) if picked else "none")
    top = picked[0]["payload"]["suggestions"][0] if picked else {}
    check("top locator is the test id", top.get("value") == "pick-me", f"{top.get('label')}={top.get('value')}")
    check("overlay torn down after pick", not overlay_present())

    # Escape cancels
    clear_events()
    send({"type": "START_PICK"})
    fixture.mouse.move(cx, cy)
    fixture.wait_for_timeout(100)
    fixture.keyboard.press("Escape")
    fixture.wait_for_timeout(200)
    check("Escape reports PICK_CANCELLED", len(events("PICK_CANCELLED")) == 1)
    check("Escape tears the overlay down", not overlay_present())

    # Mode switch while active — the arbiter's whole reason to exist.
    clear_events()
    send({"type": "START_PICK"})
    fixture.mouse.move(cx, cy)
    fixture.wait_for_timeout(100)
    send({"type": "START_PICK_FIELDS"})
    fixture.wait_for_timeout(100)
    # Use an ENABLED field: Chrome does not dispatch mouse events on a disabled
    # form control, so clicking #email would prove nothing about the arbiter.
    age = fixture.locator("#age").bounding_box()
    fixture.mouse.click(age["x"] + age["width"] / 2, age["y"] + age["height"] / 2)
    fixture.wait_for_timeout(300)
    fields = events("FIELD_PICKED")
    check("mode switch while active lands in field mode",
          len(fields) >= 1 and len(events("ELEMENT_PICKED")) == 0,
          f"FIELD_PICKED={len(fields)} ELEMENT_PICKED={len(events('ELEMENT_PICKED'))}")
    send({"type": "CANCEL_PICK"})
    fixture.wait_for_timeout(150)
    check("CANCEL_PICK restores the cursor",
          fixture.evaluate("() => document.documentElement.style.cursor") == "")

    # Recorder
    clear_events()
    check("START_RECORD accepted", send({"type": "START_RECORD"}).get("ok") is True)
    fixture.wait_for_timeout(150)
    check("recorder indicator shown",
          fixture.evaluate("() => !!document.querySelector('senmurv-recorder-indicator')"))
    fixture.locator("#picktarget").click()
    fixture.wait_for_timeout(300)
    check("click is recorded", len(events("ACTION_RECORDED")) >= 1,
          json.dumps(events("ACTION_RECORDED")[:1]))
    send({"type": "STOP_RECORD"})
    fixture.wait_for_timeout(150)
    check("recorder indicator removed",
          not fixture.evaluate("() => !!document.querySelector('senmurv-recorder-indicator')"))

    # ======================= (3) UNLOCK / RESTORE ===========================
    print("\n=== (3) Bypass → Restore → reload ===")

    before = {s: attrs(s) for s in ("#email", "#age", "#code", "#billing", "#pro", "#secret", "#csrf")}

    res = send({"type": "BYPASS_PAGE", "payload": {"options": OPTS_ALL, "shouldWatch": False}})
    check("BYPASS_PAGE succeeds", res.get("ok") is True, json.dumps(res.get("value", res))[:160])

    check("disabled input enabled", "disabled" not in (attrs("#email") or {}))
    check("readonly cleared", "readonly" not in (attrs("#code") or {}))
    check("required dropped", "required" not in (attrs("#email") or {}))
    check("step set to 'any', not removed", (attrs("#age") or {}).get("step") == "any")
    check("form gained novalidate", "novalidate" in (attrs("#signup") or {}))
    check("disabled fieldset fixed at the fieldset", "disabled" not in (attrs("#billing") or {}))
    check("disabled option unlocked", "disabled" not in (attrs("#pro") or {}))
    check("password revealed", (attrs("#secret") or {}).get("type") == "text")
    check("hidden input revealed", (attrs("#csrf") or {}).get("type") == "text")
    check("[hidden] div revealed", "hidden" not in (attrs("#secret-panel") or {}))
    check("inert + aria-hidden cleared",
          "inert" not in (attrs("#aria-panel") or {}) and "aria-hidden" not in (attrs("#aria-panel") or {}))

    # The injected sheet must actually beat the page's `display: none`.
    check("CSS-hidden div is now visible (override sheet applied)",
          fixture.evaluate("() => getComputedStyle(document.querySelector('#css-panel')).display") != "none",
          fixture.evaluate("() => getComputedStyle(document.querySelector('#css-panel')).display"))

    # Field is genuinely typable now.
    fixture.locator("#email").fill("qa@example.com")
    check("unlocked field accepts input",
          fixture.input_value("#email") == "qa@example.com")

    state = send({"type": "GET_BYPASS_STATE"})
    check("state reports unlocked", state.get("value", {}).get("isActive") is True, json.dumps(state))
    check("state reports no Dynamics form here", state.get("value", {}).get("hasXrm") is False)

    # --- Restore ---
    res = send({"type": "RESTORE_PAGE"})
    check("RESTORE_PAGE succeeds", res.get("ok") is True, json.dumps(res)[:120])
    for sel, original in before.items():
        check(f"restored exactly: {sel}", attrs(sel) == original,
              f"want {original} got {attrs(sel)}")
    check("override sheet removed (css-hidden div hidden again)",
          fixture.evaluate("() => getComputedStyle(document.querySelector('#css-panel')).display") == "none")
    check("state reports not unlocked",
          send({"type": "GET_BYPASS_STATE"}).get("value", {}).get("isActive") is False)

    # --- Sticky mode ---
    send({"type": "BYPASS_PAGE", "payload": {"options": OPTS_DEFAULT, "shouldWatch": True}})
    fixture.evaluate("() => document.querySelector('#email').setAttribute('disabled','disabled')")
    fixture.wait_for_timeout(500)
    check("sticky mode re-strips a re-applied lock", "disabled" not in (attrs("#email") or {}))
    send({"type": "RESTORE_PAGE"})
    fixture.wait_for_timeout(200)
    check("restore after sticky puts the original back", attrs("#email") == before["#email"],
          f"want {before['#email']} got {attrs('#email')}")

    # --- Hard reload discards the undo record, and the state says so ---
    send({"type": "BYPASS_PAGE", "payload": {"options": OPTS_DEFAULT, "shouldWatch": False}})
    fixture.reload(wait_until="load")
    fixture.wait_for_timeout(500)
    after_reload = send({"type": "GET_BYPASS_STATE"})
    check("after reload the state honestly reports not unlocked",
          after_reload.get("value", {}).get("isActive") is False, json.dumps(after_reload))
    check("page markup is back to its original after reload",
          attrs("#email") == before["#email"])

    # --- No console noise on the host page ---
    noise = [e for e in page_errors if "favicon" not in e.lower()]
    check("no console errors introduced on the host page", noise == [], f"{noise}")

    print("\n--- SUMMARY ---")
    failed = [r for r in results if not r[1]]
    print(f"{len(results) - len(failed)}/{len(results)} passed")
    for name, _, detail in failed:
        print(f"  FAILED: {name} — {detail}")
    ctx.close()
    sys.exit(1 if failed else 0)
