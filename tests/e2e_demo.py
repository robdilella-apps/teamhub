"""Browser smoke test against the demo build (`npm run build -- --mode demo && npx vite preview`).
Usage: python3 tests/e2e_demo.py [base_url] [screenshot_dir]"""
import sys
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173"
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None

def shot(page, name):
    if SHOTS:
        page.screenshot(path=f"{SHOTS}/{name}.png")

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
    page = ctx.new_page()
    page.goto(BASE)
    page.evaluate("localStorage.clear()"); page.reload()
    expect(page.get_by_role("button", name="Sign in")).to_be_visible()
    shot(page, "01-sign-in")
    page.get_by_role("button", name="Sign in").click()
    expect(page.get_by_text("Welcome, Alex")).to_be_visible()
    expect(page.get_by_test_id("urgent-banner")).to_be_visible()
    shot(page, "02-home-dashboard")
    page.locator("aside").get_by_role("link", name="# general").click()
    expect(page.get_by_text("Welcome to TeamHub, everyone!")).to_be_visible()
    page.get_by_text("2 replies").click()
    expect(page.get_by_text("Already installed it on my phone.")).to_be_visible()
    shot(page, "03-channel-with-thread")
    box = page.get_by_placeholder("Message # general")
    box.fill("Smoke test: hello team from the automated test ✅"); box.press("Enter")
    expect(page.get_by_text("Smoke test: hello team")).to_be_visible()
    page.get_by_role("button", name="Got it").click()
    expect(page.get_by_test_id("urgent-banner")).to_have_count(0)
    page.get_by_role("link", name="📣 Announcements").click()
    page.get_by_role("button", name="Acknowledge").click()
    expect(page.get_by_text("✓ Acknowledged")).to_be_visible()
    page.get_by_role("link", name="🏆 Kudos").click()
    expect(page.get_by_text("Thanks for covering the late delivery today!")).to_be_visible()
    page.get_by_role("link", name="⚙️ Admin").click()
    expect(page.get_by_text("riley@example.com")).to_be_visible()
    shot(page, "04-admin-people")
    page.get_by_role("link", name="🔍 Search").click()
    page.get_by_placeholder("Search messages").fill("delivery"); page.get_by_role("button", name="Search").click()
    expect(page.get_by_text("1 result(s)")).to_be_visible()
    # mobile view
    m = ctx.new_page(); m.set_viewport_size({"width": 390, "height": 844})
    m.goto(BASE + "/#/dm/dm1")
    expect(m.get_by_text("Sure, Thursday at 10 works.")).to_be_visible()
    if SHOTS: m.screenshot(path=f"{SHOTS}/05-mobile-dm.png")
    # member permissions
    page.get_by_role("button", name="Sign out").click()
    page.get_by_placeholder("Email").fill("taylor@example.com"); page.get_by_role("button", name="Sign in").click()
    expect(page.get_by_text("Welcome, Taylor")).to_be_visible()
    expect(page.get_by_role("link", name="⚙️ Admin")).to_have_count(0)
    expect(page.get_by_role("link", name="🔒 managers")).to_have_count(0)
    b.close()
print("E2E DEMO TESTS PASSED")
